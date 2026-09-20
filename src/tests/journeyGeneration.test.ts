import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleJourney } from '../../supabase/functions/learning/journey';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { embedConcepts } from '../../supabase/functions/learning/conceptEmbeddings';
import { preparedJourney, sampleQuestion } from './fixtures/preparedJourney';
import { DIMENSION_ORDER, type JourneyNode, type JourneyProgress } from '../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES } from '../../supabase/functions/_shared/reasoning';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));
vi.mock('../../supabase/functions/learning/conceptEmbeddings', () => ({ embedConcepts: vi.fn() }));
const key = async () => 'test-key';
const question = sampleQuestion();
const answer = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const approve = () => answer({
    approved: true,
    feedback: 'No blocking issues.'
});
const vector = [1, ...Array.from({ length: 767 }, () => 0)];

function database(nodes = preparedJourney('Life').nodes, active = false, history: string[] = []) {
    const graph = {
        nodes: structuredClone(nodes),
        progress: {} as JourneyProgress,
        generation: 0
    };
    const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
        load_learning_graph: () => graph,
        begin_graph_expansion: () => ({
            lease: 'lease',
            graph
        }),
        match_concept_embeddings: () => [],
        save_generated_nodes: args => {
            const patch = args.p_nodes as JourneyNode[];
            graph.nodes = [...graph.nodes.filter(node => !patch.some(saved => saved.id === node.id)), ...patch];
        },
        begin_graph_question: args => active ? { active: { id: 'active' } } : {
            lease: 'lease',
            generation: 0,
            node: graph.nodes.find(n => n.id === args.p_node)
        },
        graph_question_history: () => history,
        finish_graph_question: args => ({
            id: 'issued',
            ...args.p_question as object
        }),
    };
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
        data: handlers[name]?.(args) ?? true,
        error: null
    })) };
    return {
        db,
        graph
    };
}

function master(graph: ReturnType<typeof database>['graph'], node: JourneyNode) {
    const keys = node.kind === 'concept' ? [...DIMENSION_ORDER, ...REASONING_COMPLEXITIES] : ['boss'];
    graph.progress[node.id] = Object.fromEntries(keys.map(step => [step, {
        attempts: 1,
        successes: 1
    }]));
}

const practice = (db: ReturnType<typeof database>['db'], topic?: string) => handleJourney(db, 'user', {
    action: 'journey_practice',
    topic
}, key);
const explicit = (db: ReturnType<typeof database>['db'], nodeId = 'food-fuel') => handleJourney(db, 'user', {
    action: 'journey_question',
    nodeId
}, key);
const issuedTarget = (db: ReturnType<typeof database>['db']) => db.rpc.mock.calls.find(c => c[0] === 'begin_graph_question')?.[1];

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callGemini).mockReset().mockResolvedValue(JSON.stringify(question));
    vi.mocked(embedConcepts).mockReset().mockImplementation(async (_key, concepts) => concepts.map(() => vector));
});

describe('Topic and concept selection', () => {
    it('fills the selected concept and returns its stable continuation target', async () => {
        const nodes = preparedJourney('Life').nodes.slice(1, 2);
        nodes[0].expanded = false;
        nodes[0].dimensions = {
            intuition: 'Known intuition',
            precision: nodes[0].definition
        };
        const state = database(nodes);
        const result = await stage(state.db, completeKnowledge);
        expect(issuedTarget(state.db)).toBeUndefined();
        expect(result).toMatchObject({ targetNodeId: nodes[0].id });
        expect(state.graph.nodes[0].expanded).toBe(true);
        expect(Object.keys(state.graph.nodes[0].dimensions)).toEqual(DIMENSION_ORDER);
    });
    it('honors the reached foundation on continuation instead of making a fresh draw', async () => {
        const { db } = database(undefined, true);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        await handleJourney(db, 'user', {
            action: 'journey_practice',
            topic: 'Life',
            generation: 0,
            targetNodeId: 'cells'
        }, key);
        expect(issuedTarget(db)?.p_node).toBe('cells');
        expect(callGemini).not.toHaveBeenCalled();
    });
    it('practices an eligible concept even when no boss exists', async () => {
        const { db } = database([preparedJourney('Life').nodes[0]], true);
        await practice(db, 'Life');
        expect(issuedTarget(db)?.p_node).toBe('food-fuel');
        expect(callGemini).not.toHaveBeenCalled();
    });
    it('asks the ready boss before any unfinished concepts without another LLM call', async () => {
        const { db, graph } = database();
        graph.nodes.filter(n => n.kind === 'concept').forEach(n => master(graph, n));
        graph.nodes.push({
            ...graph.nodes[0],
            id: 'unrelated',
            title: 'Unrelated concept'
        });
        await practice(db, 'Life');
        expect(issuedTarget(db)?.p_node).toBe('boss-life');
        expect(callGemini).not.toHaveBeenCalled();
        const issued = db.rpc.mock.calls.find(c => c[0] === 'finish_graph_question')?.[1].p_question;
        expect(issued).toMatchObject({ question_text: graph.nodes[4].title });
        expect(issued).not.toHaveProperty('knowledge_entry');
    });
    it('requires indirect prerequisites to be mastered too', async () => {
        const { db, graph } = database(undefined, true);
        graph.nodes.filter(n => ['stores', 'feedback'].includes(n.id)).forEach(n => master(graph, n));
        await practice(db, 'Life');
        expect(['food-fuel', 'cells']).toContain(issuedTarget(db)?.p_node);
    });
    it('chooses a random topic first and keeps it through preparation', async () => {
        const { db } = database([]);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        answer(sampleQuestion());
        answer({ dependencies: [] });
        const result = await practice(db);
        expect(result).toMatchObject({
            preparing: true,
            topic: 'Physics'
        });
        expect(vi.mocked(callGemini).mock.calls[0][1]).toContain('Selected subtopic: Mechanics');
    });
    it('does not expose stored knowledge, answers or locked bosses in the graph', async () => {
        const { db } = database();
        const result = await handleJourney(db, 'user', { action: 'knowledge_graph' }, key);
        expect(JSON.stringify(result)).not.toMatch(/dimensions|bossQuestion|context|preparation|correctAnswer|boss-life|definition/);
        expect(callGemini).not.toHaveBeenCalled();
    });
    it('rejects missing and locked nodes but permits direct practice of eligible concepts', async () => {
        const { db } = database(undefined, true);
        await expect(explicit(db, 'missing')).rejects.toThrow('unavailable');
        await expect(explicit(db, 'boss-life')).rejects.toThrow('unavailable');
        await expect(explicit(db, 'stores')).rejects.toThrow('unavailable');
        await explicit(db, 'food-fuel');
        expect(issuedTarget(db)?.p_node).toBe('food-fuel');
    });
});

describe('Prepared dimension questions', () => {
    it('ignores client dimension overrides and stores prepared knowledge with aligned shuffled feedback', async () => {
        const { db, graph } = database();
        await explicit(db);
        const saved = db.rpc.mock.calls.find(c => c[0] === 'finish_graph_question')![1].p_question as {
            options: string[];
            option_feedback: string[];
            correct_index: number;
            knowledge_entry: string
        };
        expect(issuedTarget(db)?.p_dimension).toBe('intuition');
        expect(saved.knowledge_entry).toBe(graph.nodes[0].dimensions.intuition);
        expect(saved.options[saved.correct_index]).toBe(question.correctAnswer.text);
        for (const choice of [question.correctAnswer, ...question.wrongAnswers]) {
            expect(saved.option_feedback[saved.options.indexOf(choice.text)]).toBe(choice.feedback);
        }

        expect(vi.mocked(callGemini).mock.calls[0][1]).toContain(graph.nodes[0].dimensions.intuition);
        expect(vi.mocked(callGemini).mock.calls[0][4]).toBe('knowledge');
    });
    it('regenerates malformed choices before issuing the question', async () => {
        const { db } = database();
        answer({
            ...question,
            wrongAnswers: []
        });
        await expect(explicit(db)).resolves.toMatchObject({ questionRow: { id: 'issued' } });
        expect(callGemini).toHaveBeenCalledTimes(2);
        expect(db.rpc.mock.calls.some(c => c[0] === 'finish_graph_question')).toBe(true);
    });
    it('preserves evidence and releases the lease if the only candidate repeats an earlier question', async () => {
        const { db, graph } = database(undefined, false, [question.question]);
        const before = structuredClone(graph.progress);
        await expect(explicit(db)).rejects.toThrow('Your progress is saved');
        expect(graph.progress).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(3);
        expect(db.rpc.mock.calls.some(c => c[0] === 'finish_graph_question')).toBe(false);
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
    it('does not retry provider failures or mutate the graph', async () => {
        const { db, graph } = database([]);
        vi.mocked(callGemini).mockRejectedValue(new Error('Provider unavailable'));
        await expect(practice(db, 'Life')).rejects.toThrow('Provider unavailable');
        expect(graph.nodes).toEqual([]);
        expect(callGemini).toHaveBeenCalledTimes(1);
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
});

const completeKnowledge = Object.fromEntries(DIMENSION_ORDER.map(dimension => [dimension, `Full ${dimension} knowledge`]));
type DependencyFixture = {
    conceptTitle: string;
    conceptFormalDefinition: string;
    conceptIntuition: string;
    dependencies: DependencyFixture[]
};
const dependency = (title: string, dependencies: DependencyFixture[] = []): DependencyFixture => ({
    conceptTitle: title,
    conceptFormalDefinition: `${title} formal definition`,
    conceptIntuition: `${title} intuition`,
    dependencies
});
const leafTitles = (dependencies: DependencyFixture[]): string[] => dependencies.flatMap(item =>
    item.dependencies.length ? leafTitles(item.dependencies) : [item.conceptTitle]);
async function stage(db: ReturnType<typeof database>['db'], response: unknown) {
    answer(response);
    return practice(db, 'Life');
}

async function stageBoss(db: ReturnType<typeof database>['db'], response: unknown) {
    const { dependencies, ...question } = response as ReturnType<typeof sampleQuestion> & { dependencies: ReturnType<typeof dependency>[] };
    answer(question);
    answer({ dependencies });
    for (let index = 0; index < new Set(leafTitles(dependencies)).size; index += 1) {
        approve();
    }

    return practice(db, 'Life');
}

describe('Complete dependency tree persistence', () => {
    it('does not save a lesson or change progress when the only lesson is invalid', async () => {
        const seed = preparedJourney('Life').nodes[0];
        const state = database([{
            ...seed,
            kind: 'concept',
            expanded: false,
            dimensions: {
                intuition: 'Draft intuition',
                precision: seed.definition
            }
        }]);
        const before = structuredClone(state.graph);
        answer({
            ...completeKnowledge,
            precision: ''
        });

        await expect(practice(state.db, 'Life')).rejects.toThrow('Your progress is saved');
        expect(state.graph).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(3);
        expect(state.db.rpc.mock.calls.some(call => call[0] === 'save_generated_nodes')).toBe(false);
        expect(state.db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });

    it('stores the boss and every dependency in one generation stage', async () => {
        const state = database([]);
        await stageBoss(state.db, {
            ...sampleQuestion('Why does this system stabilize?'),
            dependencies: [dependency('Feedback', [dependency('Control')])]
        });
        expect(state.graph.nodes.map(n => n.title)).toEqual(['Why does this system stabilize?', 'Feedback', 'Control']);
        expect(state.graph.nodes[0].requires[0].nodeId).toBe(state.graph.nodes[1].id);
        expect(state.graph.nodes[1].requires[0].nodeId).toBe(state.graph.nodes[2].id);
        expect(state.graph.nodes.slice(1).map(n => n.expanded)).toEqual([false, false]);
        expect(Object.keys(state.graph.nodes[2].dimensions)).toEqual(['intuition', 'precision']);
        expect(callGemini).toHaveBeenCalledTimes(3);
    });
    it('expands a selected leaf once and asks it on the continuation request', async () => {
        const leaf = {
            ...preparedJourney('Life').nodes[0],
            expanded: false,
            dimensions: {
                intuition: 'Known intuition',
                precision: 'Known formal definition'
            }
        } as JourneyNode;
        const state = database([leaf]);
        const prepared = await stage(state.db, completeKnowledge);
        expect(prepared).toMatchObject({ targetNodeId: leaf.id });
        await handleJourney(state.db, 'user', {
            action: 'journey_practice',
            topic: 'Life',
            generation: 0,
            targetNodeId: leaf.id
        }, key);
        expect(issuedTarget(state.db)?.p_node).toBe(leaf.id);
        expect(callGemini).toHaveBeenCalledTimes(2);
    });
    it('persists a zero-prerequisite boss and asks it on the next selection', async () => {
        const { db, graph } = database([]);
        await stageBoss(db, {
            ...question,
            dependencies: []
        });
        expect(graph.nodes).toHaveLength(1);
        await practice(db, 'Life');
        expect(issuedTarget(db)?.p_node).toBe(graph.nodes[0].id);
        expect(callGemini).toHaveBeenCalledTimes(2);
    });
});
