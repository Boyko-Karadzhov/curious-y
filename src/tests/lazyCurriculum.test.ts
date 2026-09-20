import { beforeEach, expect, it, vi } from 'vitest';
import { DIMENSION_ORDER, knowledgeGraph, nodeAvailable, type JourneyNode, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES } from '../../supabase/functions/_shared/reasoning';
import { createBoss, expandNode, type IConceptDependency } from '../../supabase/functions/learning/curriculum';
import { selectCurriculumTarget } from '../../supabase/functions/learning/curriculumSelection';
import { callGemini } from '../../supabase/functions/learning/gemini';
import type { QuestionContent } from '../../supabase/functions/learning/questionContent';
import { prepareFixtureNode, sampleQuestion } from './fixtures/preparedJourney';
import { DIMENSION_GUIDANCE } from '../../supabase/functions/learning/knowledgePrompts';
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
const graph = (nodes: JourneyNode[]): LearningGraph & { generation: number } => ({
    nodes,
    progress: {},
    generation: 0
});
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const replyBoss = (value: QuestionContent & { dependencies: IConceptDependency[] }) => {
    const { dependencies, ...question } = value;
    reply(question);
    reply({ dependencies });
};

const dependency = (title: string, dependencies: IConceptDependency[] = []): IConceptDependency => ({
    conceptTitle: title,
    conceptFormalDefinition: `${title} formal definition`,
    conceptIntuition: `${title} intuition`,
    dependencies
});
const knowledge = Object.fromEntries(DIMENSION_ORDER.map(dimension => [dimension, `${dimension} knowledge`]));

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callGemini).mockReset();
});

it('selects only concepts whose complete prerequisites are mastered', () => {
    const locked = stub('locked', [{ nodeId: 'unexpanded' }]);
    const saved = graph([prepared('ready'), stub('unexpanded'), stub('another'), locked, prepared('mastered')]);
    saved.progress.mastered = Object.fromEntries([...DIMENSION_ORDER, ...REASONING_COMPLEXITIES].map(step => [step, {
        successes: 1,
        attempts: 1
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

it('rewrites the selected lesson while preserving its identity and dependency edges', async () => {
    const root = stub('root', [{ nodeId: 'foundation' }]);
    const saved = graph([root, prepared('foundation')]);
    reply(knowledge);
    const result = await expandNode('key', root, saved);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
        id: 'root',
        expanded: true,
        definition: 'root formal definition',
        requires: [{ nodeId: 'foundation' }]
    });
    expect(Object.keys(result.nodes[0].dimensions)).toEqual(DIMENSION_ORDER);
    expect(result.nodes[0].dimensions).toMatchObject({
        intuition: 'intuition knowledge',
        precision: 'precision knowledge'
    });
    expect(saved.nodes[0].expanded).toBe(false);
    expect(callGemini).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callGemini).mock.calls[0][1]).toContain('"prerequisites":[{"title":"foundation","summary":"foundation formal definition"}]');
});

it('generates the boss question and its concept tree once each', async () => {
    replyBoss({
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
    expectBossGenerationCall();
});

function expectBossGenerationCall() {
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(callGemini).toHaveBeenNthCalledWith(1, 'key', expect.any(String), expect.any(Object), false, 'knowledge');
    expect(vi.mocked(callGemini).mock.calls[0][1]).not.toContain('prerequisite concept tree');
    expect(vi.mocked(callGemini).mock.calls[0][1]).not.toContain(DIMENSION_GUIDANCE.intuition);
    expect(vi.mocked(callGemini).mock.calls[1][1]).toContain(DIMENSION_GUIDANCE.intuition);
    expect(vi.mocked(callGemini).mock.calls[1][1]).toContain(DIMENSION_GUIDANCE.precision);
}

it('reuses an existing concept identity instead of creating or rewriting it', async () => {
    const existing = prepared('shared');
    replyBoss({
        ...sampleQuestion('How is this shared?'),
        dependencies: [dependency('shared', [dependency('Ignored child')])]
    });
    const result = await createBoss('key', 'Life', graph([existing]));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].requires).toEqual([{ nodeId: 'shared' }]);
    expect(existing.requires).toEqual([]);
    expect(callGemini).toHaveBeenCalledTimes(2);
});

function preparedBoundary() {
    const existing = prepared('existing');
    existing.title = 'Cell membrane';
    existing.definition = 'A selectively permeable lipid boundary around a cell.';
    existing.dimensions.intuition = 'The cell’s controlled boundary.';
    return existing;
}

it('does not reconcile differently titled concepts', async () => {
    const existing = preparedBoundary();
    replyBoss({
        ...sampleQuestion('How does this boundary regulate transport?'),
        dependencies: [dependency('Plasma membrane')]
    });
    const result = await createBoss('key', 'Life', graph([existing]));
    const prompts = vi.mocked(callGemini).mock.calls.map(call => call[1]);
    expect(prompts[0]).not.toContain('Cell membrane');
    expect(prompts[1]).not.toContain('Cell membrane');
    expect(result.nodes.map(node => node.title)).toContain('Plasma membrane');
    expect(result.nodes[0].requires[0].nodeId).not.toBe(existing.id);
});

it('accepts the first structurally valid concept plan without an audit', async () => {
    const shallow = {
        ...sampleQuestion('Why can one transport process slow another?'),
        dependencies: [dependency('Thermodynamic Back-Pressure in Coupled Fluxes')]
    };
    replyBoss(shallow);
    const result = await createBoss('key', 'Physics', graph([]));
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(result.nodes.map(node => node.title)).toContain('Thermodynamic Back-Pressure in Coupled Fluxes');
});

it('rejects malformed concept JSON without retrying', async () => {
    reply(sampleQuestion('Can this cycle?'));
    reply({ dependencies: [{ conceptTitle: 'A' }] });
    await expect(createBoss('key', 'Life', graph([]))).rejects.toThrow('could not prepare valid learning material');
    expect(callGemini).toHaveBeenCalledTimes(2);
});
