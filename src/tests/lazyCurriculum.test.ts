import { beforeEach, expect, it, vi } from 'vitest';
import { FACET_ORDER, knowledgeGraph, nodeAvailable, type JourneyNode, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { advanceCurriculum, conceptDraft } from '../../supabase/functions/learning/curriculum';
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
    facets: [...FACET_ORDER],
    requires: [],
    prerequisiteConcepts: []
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
    prerequisites: [],
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
        requires: [{
            nodeId: 'unexpanded',
            facets: [...FACET_ORDER]
        }]
    };
    const saved = graph([prepared('ready'), stub('unexpanded'), stub('another'), locked, prepared('mastered')]);
    saved.progress.mastered = Object.fromEntries([...FACET_ORDER, 'advanced'].map(f => [f, {
        successes: 3,
        attempts: 3
    }]));
    return saved;
}

it('does not mistake an unexpanded concept with no known prerequisites for an eligible foundation', () => {
    expect(nodeAvailable(stub('pending'), {})).toBe(false);
    expect(knowledgeGraph(graph([stub('pending')])).nodes).toEqual([]);
});

it('expands one depth-first path and leaves all siblings unprepared', async () => {
    const saved = graph([stub('root')]);
    const branched = await expandRoot(saved);
    expect(branched.queue).toEqual([{
        nodeId: branched.nodes[1].id,
        stage: 'knowledge'
    }]);
    reply(knowledge);
    const preparedDraft = await advanceCurriculum('key', branched, saved);
    reply({ concepts: [] });
    const dependencies = await advanceCurriculum('key', preparedDraft, saved);
    const result = await advanceCurriculum('key', dependencies, saved);
    verifyPath(result, saved);
    expect(callGemini).toHaveBeenCalledTimes(3);
});

async function expandRoot(saved: LearningGraph) {
    const draft = conceptDraft('Life', saved.nodes[0]);
    draft.nodes[0] = prepared('root');
    draft.queue = [{
        nodeId: 'root',
        stage: 'match',
        names: ['first', 'sibling', 'other']
    }];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    reply({ matches: ['first', 'sibling', 'other'].map(match) });
    return advanceCurriculum('key', draft, saved);
}

function verifyPath(result: Awaited<ReturnType<typeof advanceCurriculum>>, saved: LearningGraph) {
    expect(result.queue).toEqual([]);
    expect(result.targetId).toBe(result.nodes[1].id);
    expect(result.nodes.slice(2).map(n => n.expanded)).toEqual([false, false]);
    expect(result.nodes.slice(2).every(n => !n.curriculum && !n.requires.length)).toBe(true);
    expect(saved.nodes[0].expanded).toBe(false);
}

it('follows reused unexpanded prerequisites instead of treating them as completed work', async () => {
    const saved = graph([stub('root'), stub('shared')]);
    const draft = conceptDraft('Life', saved.nodes[0]);
    draft.nodes[0] = prepared('root');
    draft.queue = [{
        nodeId: 'root',
        stage: 'match',
        names: ['shared']
    }];
    reply({ matches: [{
        ...match('shared'),
        existingId: 'shared'
    }] });
    const result = await advanceCurriculum('key', draft, saved);
    expect(result.queue).toEqual([{
        nodeId: 'shared',
        stage: 'knowledge'
    }]);
    expect(result.nodes.map(n => n.id)).toEqual(['root', 'shared']);
    expect(saved.nodes.every(n => n.expanded === false)).toBe(true);
});

it('stops at an existing eligible prerequisite without preparing unrelated siblings', async () => {
    const saved = graph([stub('root'), prepared('shared')]);
    const draft = conceptDraft('Life', saved.nodes[0]);
    draft.nodes[0] = prepared('root');
    draft.queue = [{
        nodeId: 'root',
        stage: 'match',
        names: ['shared', 'sibling']
    }];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    reply({ matches: [{
        ...match('shared'),
        existingId: 'shared'
    }, match('sibling')] });
    const result = await advanceCurriculum('key', draft, saved);
    expect(result.targetId).toBe('shared');
    expect(result.queue).toEqual([]);
    expect(result.nodes[1].expanded).toBe(false);
    expect(callGemini).toHaveBeenCalledTimes(1);
});
