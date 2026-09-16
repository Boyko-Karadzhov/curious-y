import { beforeEach, expect, it, vi } from 'vitest';
import { FACET_ORDER, knowledgeGraph, nodeAvailable, type JourneyNode, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { expandNode } from '../../supabase/functions/learning/curriculum';
import { selectCurriculumTarget } from '../../supabase/functions/learning/curriculumSelection';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { prepareFixtureNode } from './fixtures/preparedJourney';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));

const stub = (id: string): JourneyNode => ({
    id,
    title: id,
    topic: 'Life',
    topics: ['Life'],
    definition: `${id} meaning`,
    kind: 'concept',
    expanded: false,
    dimensions: {},
    requires: [],
});
const prepared = (id: string) => prepareFixtureNode(stub(id));
const graph = (nodes: JourneyNode[]): LearningGraph => ({
    nodes,
    progress: {}
});
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const match = (name: string) => ({
    name,
    title: name,
    definition: `${name} meaning`,
    topic: 'Life',
    existingId: '',
    needsLearning: true
});
const knowledge = {
    prerequisites: ['first'],
    dimensions: Object.fromEntries(FACET_ORDER.map(f => [f, `${f} knowledge`]))
};

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callGemini).mockReset();
});

it('samples eligible and unexpanded concepts uniformly while excluding locked and mastered concepts', () => {
    const saved = selectionGraph();
    const selected = Array.from({ length: 300 }, (_, i) => selectCurriculumTarget(saved, 'Life', () => (i + 0.5) / 300)!.id);
    expect(selected.filter(id => id === 'ready')).toHaveLength(100);
    expect(selected.filter(id => id === 'unexpanded')).toHaveLength(100);
    expect(selected.filter(id => id === 'another')).toHaveLength(100);
    expect(knowledgeGraph(saved).nodes.map(n => n.id)).toEqual(['ready', 'mastered']);
});

function selectionGraph(): LearningGraph {
    const locked = {
        ...prepared('locked'),
        requires: [{ nodeId: 'unexpanded' }]
    };
    const saved = graph([prepared('ready'), stub('unexpanded'), stub('another'), locked, prepared('mastered')]);
    saved.progress.mastered = Object.fromEntries([...FACET_ORDER, 'advanced'].map(f => [f, {
        successes: 3,
        attempts: 3
    }]));
    return saved;
}

it('does not mistake an unexpanded concept with no known prerequisites for an eligible foundation', () => {
    expect(nodeAvailable(stub('pending'), [stub('pending')], {})).toBe(false);
    expect(knowledgeGraph(graph([stub('pending')])).nodes).toEqual([]);
});

it('returns prepared knowledge as a durable patch before generating dependencies', async () => {
    const saved = graph([stub('root')]);
    reply(knowledge);
    const result = await expandNode('key', saved.nodes[0], saved);
    expect(result.nodes[0]).toMatchObject({ expanded: false });
    expect(result.nodes[0].preparation).toEqual({
        stage: 'dependencies',
        names: ['first']
    });
    expect(Object.keys(result.nodes[0].dimensions)).toEqual(FACET_ORDER);
    expect(saved.nodes[0].dimensions).toEqual({});
});

it('saves extracted dependency names before matching them', async () => {
    const root = preparedStage('dependencies', ['first']);
    reply({ concepts: ['sibling', 'first'] });
    const result = await expandNode('key', root, graph([root]));
    expect(result.nodes[0].preparation).toEqual({
        stage: 'match',
        names: ['first', 'sibling']
    });
});

it('expands one node and persists untouched prerequisites as placeholders', async () => {
    const root = preparedStage('match', ['first', 'sibling', 'other']);
    const saved = graph([root]);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    reply({ matches: ['first', 'sibling', 'other'].map(match) });
    const result = await expandNode('key', root, saved);
    expect(result.nodes[0].expanded).toBe(true);
    expect(result.nodes[0].preparation).toBeUndefined();
    expect(result.nodes.slice(1).map(node => node.expanded)).toEqual([false, false, false]);
    expect(saved.nodes[0].expanded).toBe(false);
});

it('reuses an unfinished prerequisite without regenerating its knowledge', async () => {
    const root = preparedStage('match', ['shared']);
    const shared = stub('shared');
    const saved = graph([root, shared]);
    reply({ matches: [{
        ...match('shared'),
        existingId: 'shared'
    }] });
    const result = await expandNode('key', root, saved);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].requires[0].nodeId).toBe('shared');
    expect(shared.dimensions).toEqual({});
});

it('reuses an existing eligible prerequisite and leaves selection to the next request', async () => {
    const root = preparedStage('match', ['shared']);
    const shared = prepared('shared');
    const saved = graph([root, shared]);
    reply({ matches: [{
        ...match('shared'),
        existingId: 'shared'
    }] });
    const result = await expandNode('key', root, saved);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].requires[0].nodeId).toBe('shared');
    expect(callGemini).toHaveBeenCalledTimes(1);
});

function preparedStage(stage: 'dependencies' | 'match', names: string[]): JourneyNode {
    return {
        ...prepared('root'),
        expanded: false,
        requires: [],
        preparation: {
            stage,
            names
        }
    };
}
