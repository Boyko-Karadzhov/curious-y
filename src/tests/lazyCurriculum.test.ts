import { beforeEach, expect, it, vi } from 'vitest';
import { FACET_ORDER, knowledgeGraph, nodeAvailable, type JourneyNode, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { createBoss, expandNode, type IConceptDependency } from '../../supabase/functions/learning/curriculum';
import { selectCurriculumTarget } from '../../supabase/functions/learning/curriculumSelection';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { prepareFixtureNode, sampleQuestion } from './fixtures/preparedJourney';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));

const stub = (id: string, requires: JourneyNode['requires'] = []): JourneyNode => ({
    id,
    title: id,
    topic: 'Life',
    topics: ['Life'],
    definition: `${id} formal definition`,
    kind: 'concept',
    expanded: false,
    dimensions: {
        intuition: `${id} intuition`,
        precision: `${id} formal definition`
    },
    requires,
});
const prepared = (id: string) => prepareFixtureNode(stub(id));
const graph = (nodes: JourneyNode[]): LearningGraph => ({
    nodes,
    progress: {}
});
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const dependency = (title: string, dependencies: IConceptDependency[] = []): IConceptDependency => ({
    conceptTitle: title,
    conceptFormalDefinition: `${title} formal definition`,
    conceptIntuition: `${title} intuition`,
    dependencies
});
const remaining = Object.fromEntries(
    FACET_ORDER.filter(facet => !['intuition', 'precision'].includes(facet)).map(facet => [facet, `${facet} knowledge`])
);

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callGemini).mockReset();
});

it('selects only concepts whose complete prerequisites are mastered', () => {
    const locked = stub('locked', [{ nodeId: 'unexpanded' }]);
    const saved = graph([prepared('ready'), stub('unexpanded'), stub('another'), locked, prepared('mastered')]);
    saved.progress.mastered = Object.fromEntries([...FACET_ORDER, 'advanced'].map(f => [f, {
        successes: 3,
        attempts: 3
    }]));
    const selected = Array.from({ length: 300 }, (_, i) => selectCurriculumTarget(saved, 'Life', () => (i + 0.5) / 300)!.id);
    expect(selected.filter(id => id === 'ready')).toHaveLength(100);
    expect(selected.filter(id => id === 'unexpanded')).toHaveLength(100);
    expect(selected.filter(id => id === 'another')).toHaveLength(100);
    expect(selected).not.toContain('locked');
    expect(knowledgeGraph(saved).nodes.map(n => n.id)).toEqual(['ready', 'mastered']);
});

it('keeps an unexpanded foundation private until its remaining dimensions exist', () => {
    expect(nodeAvailable(stub('pending'), [stub('pending')], {})).toBe(false);
    expect(knowledgeGraph(graph([stub('pending')])).nodes).toEqual([]);
});

it('expands only the selected concept while preserving its definitions and dependency edges', async () => {
    const root = stub('root', [{ nodeId: 'foundation' }]);
    const saved = graph([root, prepared('foundation')]);
    reply(remaining);
    const result = await expandNode('key', root, saved);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
        id: 'root',
        expanded: true,
        definition: 'root formal definition',
        requires: [{ nodeId: 'foundation' }]
    });
    expect(Object.keys(result.nodes[0].dimensions)).toEqual(FACET_ORDER);
    expect(result.nodes[0].dimensions).toMatchObject({
        intuition: 'root intuition',
        precision: 'root formal definition'
    });
    expect(saved.nodes[0].expanded).toBe(false);
    expect(callGemini).toHaveBeenCalledOnce();
});

it('creates the boss and its complete dependency tree in one generation call', async () => {
    reply({
        ...sampleQuestion('Why does this system stabilize?'),
        dependencies: [
            dependency('Feedback', [dependency('Control')]),
            dependency('Measurement', [dependency('Control')])
        ]
    });
    const result = await createBoss('key', 'Life', graph([]));
    const [boss, feedback, control, measurement] = result.nodes;
    expect(boss).toMatchObject({
        kind: 'boss',
        expanded: true
    });
    expect(boss.requires).toEqual([{ nodeId: feedback.id }, { nodeId: measurement.id }]);
    expect(feedback.requires).toEqual([{ nodeId: control.id }]);
    expect(measurement.requires).toEqual([{ nodeId: control.id }]);
    expect(result.nodes.slice(1).map(node => node.expanded)).toEqual([false, false, false]);
    expect(result.nodes.slice(1).map(node => Object.keys(node.dimensions))).toEqual([
        ['intuition', 'precision'], ['intuition', 'precision'], ['intuition', 'precision']
    ]);
    expect(callGemini).toHaveBeenCalledOnce();
    expect(callGemini).toHaveBeenCalledWith('key', expect.any(String), expect.any(Object), false);
});

it('reuses an existing concept identity instead of creating or rewriting it', async () => {
    const existing = prepared('shared');
    reply({
        ...sampleQuestion('How is this shared?'),
        dependencies: [dependency('shared', [dependency('Ignored child')])]
    });
    const result = await createBoss('key', 'Life', graph([existing]));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].requires).toEqual([{ nodeId: 'shared' }]);
    expect(existing.requires).toEqual([]);
});

it('rejects a repeated concept on its own dependency path', async () => {
    const bad = {
        ...sampleQuestion('Can this cycle?'),
        dependencies: [dependency('A', [dependency('B', [dependency('A')])])]
    };
    vi.mocked(callGemini).mockResolvedValue(JSON.stringify(bad));
    await expect(createBoss('key', 'Life', graph([]))).rejects.toThrow('could not prepare valid learning material');
    expect(callGemini).toHaveBeenCalledTimes(3);
});

it('rejects a cycle created by merging repeated concepts across branches', async () => {
    const bad = {
        ...sampleQuestion('Can merged concepts cycle?'),
        dependencies: [dependency('A', [dependency('B')]), dependency('B', [dependency('A')])]
    };
    vi.mocked(callGemini).mockResolvedValue(JSON.stringify(bad));
    await expect(createBoss('key', 'Life', graph([]))).rejects.toThrow('could not prepare valid learning material');
    expect(callGemini).toHaveBeenCalledTimes(3);
});
