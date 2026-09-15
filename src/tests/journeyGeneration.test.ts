import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleJourney } from '../../supabase/functions/learning/journey';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { preparedJourney, sampleQuestion } from './fixtures/preparedJourney';
import { FACET_ORDER, type JourneyNode, type JourneyProgress } from '../../supabase/functions/_shared/journey';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));
const key = async () => 'test-key';
const question = sampleQuestion();
const answer = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));

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
        save_generated_nodes: args => {
            const patch = args.p_nodes as JourneyNode[];
            graph.nodes = [...graph.nodes.filter(node => !patch.some(saved => saved.id === node.id)), ...patch];
        },
        begin_graph_question: args => active ? { active: { id: 'active' } } : {
            lease: 'lease',
            generation: 0,
            graph,
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
    graph.progress[node.id] = Object.fromEntries(node.facets.map(f => [f, {
        attempts: 2,
        successes: 2
    }]));
    if (node.kind === 'concept') {
        graph.progress[node.id].advanced = {
            attempts: 3,
            successes: 3
        };
    }
}

const practice = (db: ReturnType<typeof database>['db'], topic?: string) => handleJourney(db, 'user', {
    action: 'journey_practice',
    topic
}, key);
const explicit = (db: ReturnType<typeof database>['db'], nodeId = 'food-fuel') => handleJourney(db, 'user', {
    action: 'journey_question',
    nodeId,
    facet: 'advanced'
}, key);
const issuedTarget = (db: ReturnType<typeof database>['db']) => db.rpc.mock.calls.find(c => c[0] === 'begin_graph_question')?.[1];

beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(callGemini).mockReset().mockResolvedValue(JSON.stringify(question));
});

describe('Topic and concept selection', () => {
    it('persists prepared knowledge on the selected unfinished concept', async () => {
        const nodes = preparedJourney('Life').nodes.slice(1, 2);
        nodes[0].expanded = false;
        delete nodes[0].curriculum;
        const state = database(nodes);
        await stage(state.db, knowledge);
        expect(state.graph.nodes[0].curriculum?.preparation).toMatchObject({stage: 'dependencies'});
        expect(issuedTarget(state.db)).toBeUndefined();
        expect(state.graph.nodes[0].expanded).toBe(false);
        expect(state.graph.nodes[0].curriculum?.dimensions).toBeDefined();
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
        expect(JSON.stringify(result)).not.toMatch(/curriculum|correctAnswer|boss-life|definition/);
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
        expect(issuedTarget(db)?.p_facet).toBe('intuition');
        expect(saved.knowledge_entry).toBe(graph.nodes[0].curriculum!.dimensions!.intuition);
        expect(saved.options[saved.correct_index]).toBe(question.correctAnswer.text);
        for (const choice of [question.correctAnswer, ...question.wrongAnswers]) {
            expect(saved.option_feedback[saved.options.indexOf(choice.text)]).toBe(choice.feedback);
        }

        expect(vi.mocked(callGemini).mock.calls[0][1]).toContain(graph.nodes[0].curriculum!.dimensions!.intuition);
    });
    it('repairs a repeated question and then malformed choices without losing feedback', async () => {
        const { db } = database(undefined, false, [question.question]);
        answer(question);
        answer({
            ...sampleQuestion('A fresh scenario?'),
            wrongAnswers: []
        });
        answer(sampleQuestion('A fresh scenario?'));
        await explicit(db);
        const prompts = vi.mocked(callGemini).mock.calls.map(c => c[1]);
        expect(prompts).toHaveLength(3);
        expect(prompts[2]).toContain('Use a new example');
        expect(prompts[2]).toContain('exactly three');
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
    it('preserves evidence and releases the lease if all candidates fail', async () => {
        const { db, graph } = database(undefined, false, [question.question]);
        const before = structuredClone(graph.progress);
        await expect(explicit(db)).rejects.toThrow('Your progress is saved');
        expect(graph.progress).toEqual(before);
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

const newMatch = (name: string) => ({
    name,
    existingId: '',
    needsLearning: true,
    title: name,
    definition: `${name} definition`,
    topic: 'Life'
});
const knowledge = {
    prerequisites: [],
    dimensions: Object.fromEntries(FACET_ORDER.map(f => [f, `Full ${f} knowledge`]))
};
async function stage(db: ReturnType<typeof database>['db'], response: unknown) {
    answer(response);
    return practice(db, 'Life');
}

describe('Incremental graph persistence', () => {
    it('commits a circular proposal immediately after dropping the closing edge and releases the lease', async () => {
        const initial = preparedJourney('Life').nodes.slice(0, 1);
        initial[0].expanded = false;
        initial[0].curriculum!.preparation = {
            stage: 'match',
            names: ['Food as fuel']
        };
        const state = database(initial);
        await stage(state.db, { matches: [{
            ...newMatch('Food as fuel'),
            existingId: 'food-fuel'
        }] });
        expect(state.db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
        expect(state.graph.nodes[0]).toMatchObject({
            expanded: true,
            requires: []
        });
        expect(state.graph.nodes[0].curriculum?.preparation).toBeUndefined();
        expect(initial[0].expanded).toBe(false);
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
    it('resumes a stored boss and recursively resolves, filters and prepares its dependencies', async () => {
        const state = database([]);
        await stage(state.db, sampleQuestion('Why does this system stabilize?'));
        await stage(state.db, { concepts: ['Feedback', 'Everyday observation'] });
        await stage(state.db, { matches: [newMatch('Feedback'), {
            ...newMatch('Everyday observation'),
            needsLearning: false
        }] });
        await stage(state.db, knowledge);
        await stage(state.db, { concepts: ['Control'] });
        await stage(state.db, { matches: [newMatch('Control')] });
        await stage(state.db, knowledge);
        await stage(state.db, { concepts: [] });
        await practice(state.db, 'Life');
        verifyRecursiveGraph(state);
    });
    it('persists a zero-prerequisite boss and asks it on the next selection', async () => {
        const { db, graph } = database([]);
        await stage(db, question);
        await stage(db, { concepts: [] });
        await practice(db, 'Life');
        expect(graph.nodes).toHaveLength(1);
        await practice(db, 'Life');
        expect(issuedTarget(db)?.p_node).toBe(graph.nodes[0].id);
        expect(callGemini).toHaveBeenCalledTimes(2);
    });
});

function verifyRecursiveGraph(state: ReturnType<typeof database>) {
    expect(state.graph.nodes.map(n => n.title)).toEqual(['Why does this system stabilize?', 'Feedback', 'Control']);
    expect(state.graph.nodes[1].requires[0].nodeId).toBe(state.graph.nodes[2].id);
    expect(Object.keys(state.graph.nodes[2].curriculum!.dimensions!)).toEqual(FACET_ORDER);
    expect(state.graph.progress).toEqual({});
    expect(vi.mocked(callGemini).mock.calls.filter(c => c[1].includes('Prepare the whole knowledge of ONE concept'))).toHaveLength(2);
}
