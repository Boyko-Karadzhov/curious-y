import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleJourney } from '../../supabase/functions/learning/journey';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
import type { JourneyNode, JourneyProgress } from '../../supabase/functions/_shared/journey';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));
const plan = starterJourney('Life');
const key = vi.fn().mockResolvedValue('test-key');
const question = { question: 'How can food help a body do work?', options: ['It provides chemical energy.', 'It creates energy from nothing.', 'It replaces air.', 'It stops the need for rest.'], correctIndex: 0,
    explanation: 'Food contains chemical energy that cells can use.', knowledgeEntry: 'Food supplies energy for activity.', optionFeedback: ['Energy can be transferred.', 'Energy is not created from nothing.', 'Air still matters.', 'Rest still matters.'], assumedConcepts: [], suggestedQuestions: [] };
const audit = { blockers: [], suggestions: [] };
function database(nodes = plan.nodes, active = false, history: string[] = []) {
    const graph = { nodes: structuredClone(nodes), progress: {} as JourneyProgress, generation: 0 };
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        let data: unknown = true;
        if (name === 'load_learning_graph') data = graph;
        if (name === 'save_graph_expansion') { graph.nodes.push(...args.p_nodes as JourneyNode[]); data = graph; }
        if (name === 'begin_graph_question') data = active ? { active: { id: 'active' } } : { lease: 'lease', generation: 0, graph, node: graph.nodes.find(n => n.id === args.p_node) };
        if (name === 'graph_question_history') data = history;
        if (name === 'finish_graph_question') data = { id: 'issued', ...args.p_question as object };
        return { data, error: null };
    }) };
    return { db, graph };
}
const learn = (g: ReturnType<typeof database>['graph'], bosses = false) => {
    for (const n of g.nodes.filter(n => bosses || n.kind === 'concept')) g.progress[n.id] = Object.fromEntries(n.facets.map(f => [f, { attempts: 2, successes: n.kind === 'boss' ? 1 : 2 }]));
};
describe('Graph learning service', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.mocked(callGemini).mockResolvedValue(JSON.stringify(question)); });
    it('audits and saves new nodes then rechecks the graph before issuing a question', async () => {
        const { db } = database([]);
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValueOnce(JSON.stringify(audit));
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
        const calls = db.rpc.mock.calls.map(c => c[0]);
        expect(calls.slice(calls.indexOf('save_graph_expansion'), calls.indexOf('begin_graph_question') + 1)).toEqual(['save_graph_expansion', 'load_learning_graph', 'load_learning_graph', 'begin_graph_question']);
        expect(callGemini).toHaveBeenCalledTimes(3);
        expect(vi.mocked(callGemini).mock.calls[0][1]).toContain('There is no fixed list of basic concepts');
    });
    it('loads the graph without generating or exposing hidden nodes', async () => {
        const { db } = database();
        const result = await handleJourney(db, 'user', { action: 'knowledge_graph' }, key);
        expect(db.rpc).toHaveBeenCalledOnce(); expect(callGemini).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain(plan.nodes.at(-1)!.title);
    });
    it('reuses a waiting boss without regenerating its prerequisites', async () => {
        const { db } = database(plan.nodes, true);
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
        expect(callGemini).not.toHaveBeenCalled();
        expect(db.rpc.mock.calls.some(c => c[0] === 'save_graph_expansion')).toBe(false);
    });
    it('asks an unlocked boss before unrelated unproficient material', async () => {
        const { db, graph } = database(plan.nodes, true); learn(graph);
        graph.nodes.push({ ...plan.nodes[0], id: 'unrelated', title: 'Another idea' });
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
        expect(db.rpc).toHaveBeenLastCalledWith('begin_graph_question', expect.objectContaining({ p_node: 'boss-life' }));
        expect(callGemini).not.toHaveBeenCalled();
    });
    it('loops back after an all-reused boss is added and asks it immediately', async () => {
        const { db, graph } = database(plan.nodes, true); learn(graph, true);
        graph.nodes.push({ ...plan.nodes[0], id: 'unrelated', title: 'Unfinished unrelated concept' });
        const boss = { ...plan.nodes.at(-1)!, id: 'new-boss', title: 'How do these ideas work together in another situation?' };
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify({ topic: 'Life', nodes: [boss] })).mockResolvedValueOnce(JSON.stringify(audit));
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
        expect(graph.nodes.filter(n => n.kind === 'concept')).toHaveLength(5);
        expect(db.rpc.mock.calls.filter(c => c[0] === 'begin_graph_question').map(c => c[1].p_node)).toEqual(['new-boss']);
        expect(callGemini).toHaveBeenCalledTimes(2);
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
        expect(callGemini).toHaveBeenCalledTimes(2);
    });
    it('reuses unearned cross-topic concepts and practices their available prerequisites', async () => {
        const { db, graph } = database(plan.nodes, true);
        const boss = { ...plan.nodes.at(-1)!, id: 'physics-boss', topic: 'Physics', title: 'How does feedback regulate a machine?' };
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify({ topic: 'Physics', nodes: [boss] })).mockResolvedValueOnce(JSON.stringify(audit));
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Physics' }, key);
        expect(graph.nodes).toHaveLength(6);
        expect(['food-fuel', 'cells']).toContain(db.rpc.mock.calls.find(c => c[0] === 'begin_graph_question')![1].p_node);
        expect(vi.mocked(callGemini).mock.calls[0][1]).toContain('whether proficient or still being learned');
    });
    it('keeps factual audit failures blocking through three repairs without exposing private details', async () => {
        const { db } = database([]);
        const blocker = { kind: 'factual_error', nodeId: plan.nodes[0].id, evidence: plan.nodes[0].title, reason: 'Incorrect relationship.', fix: 'Correct the relationship.' };
        vi.mocked(callGemini).mockImplementation(async (_key, _prompt, schema) => JSON.stringify(schema && 'blockers' in (schema.properties as object) ? { blockers: [blocker], suggestions: [] } : plan));
        await expect(handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key)).rejects.toThrow('We could not prepare an accessible discovery this time. Please try again.');
        expect(callGemini).toHaveBeenCalledTimes(6);
        expect(db.rpc.mock.calls.some(c => c[0] === 'save_graph_expansion')).toBe(false);
    });
    it('accepts nonblocking breadth suggestions and keeps questions accessible', async () => {
        const { db } = database([]);
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValueOnce(JSON.stringify({ blockers: [], suggestions: ['Explore fungi in future questions.'] }));
        await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
        expect(callGemini).toHaveBeenCalledTimes(3);
        expect(vi.mocked(callGemini).mock.calls[1][1]).toContain('missing unrelated subfields is NEVER a blocker');
        expect(vi.mocked(callGemini).mock.calls[2][1]).toContain('brief inline definition');
    });
    it('ignores client facet preferences, retries unearned assumptions and keeps feedback aligned', async () => {
        const { db } = database();
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify({ ...question, assumedConcepts: ['Allosteric enzymes'] }));
        await handleJourney(db, 'user', { action: 'journey_question', nodeId: 'food-fuel', facet: 'advanced' }, key);
        expect(db.rpc).toHaveBeenCalledWith('begin_graph_question', expect.objectContaining({ p_facet: 'intuition' }));
        const saved = db.rpc.mock.calls.find(c => c[0] === 'finish_graph_question')![1].p_question as { options: string[]; option_feedback: string[]; correct_index: number };
        for (let i = 0; i < 4; i++) expect(saved.option_feedback[i]).toBe(question.optionFeedback[question.options.indexOf(saved.options[i])]);
        expect(saved.options[saved.correct_index]).toBe(question.options[0]);
        expect(callGemini).toHaveBeenCalledTimes(2);
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
    it('rejects missing, hidden and completed nodes before issuance', async () => {
        const { db, graph } = database();
        for (const nodeId of ['stranger-node', 'boss-life']) await expect(handleJourney(db, 'user', { action: 'journey_question', nodeId }, key)).rejects.toThrow(/unavailable/);
        learn(graph, true);
        await expect(handleJourney(db, 'user', { action: 'journey_question', nodeId: 'boss-life' }, key)).rejects.toThrow(/unavailable/);
        expect(callGemini).not.toHaveBeenCalled();
    });
    it('recovers the second how & why confirmation from a repeat followed by a malformed repair', async () => {
        const { db, graph } = database(plan.nodes, false, [question.question]);
        const node = graph.nodes[0];
        graph.progress[node.id] = Object.fromEntries(node.facets.slice(0, node.facets.indexOf('mechanism')).map(f => [f, { attempts: 2, successes: 2 }]));
        graph.progress[node.id].mechanism = { attempts: 1, successes: 1, entry: question.knowledgeEntry };
        const fresh = { ...question, question: 'After missing lunch, a hiker tires sooner. What could eating a snack change?' };
        const malformed = { ...fresh, optionFeedback: ['Too few entries'] };
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(question))
            .mockResolvedValueOnce(JSON.stringify(malformed)).mockResolvedValueOnce(JSON.stringify(fresh));

        await expect(handleJourney(db, 'user', { action: 'journey_question', nodeId: node.id }, key))
            .resolves.toMatchObject({ questionRow: { question_text: fresh.question } });
        expect(db.rpc).toHaveBeenCalledWith('begin_graph_question', expect.objectContaining({ p_facet: 'mechanism' }));
        const prompts = vi.mocked(callGemini).mock.calls.map(c => c[1]);
        expect(prompts[0]).toContain('SECOND confirmation');
        expect(prompts[1]).toContain(JSON.stringify(question));
        expect(prompts[2]).toContain(JSON.stringify(malformed));
        expect(prompts[2]).toContain('optionFeedback must contain exactly four strings');
        expect(prompts[2]).toContain('Use a new example');
        expect(db.rpc.mock.calls.filter(c => c[0] === 'finish_graph_question')).toHaveLength(1);
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
    it('keeps progress and releases the lease when all generated candidates are rejected', async () => {
        const { db, graph } = database(plan.nodes, false, [question.question]);
        graph.progress['food-fuel'] = { intuition: { attempts: 1, successes: 1 } };
        const before = structuredClone(graph.progress);
        await expect(handleJourney(db, 'user', { action: 'journey_question', nodeId: 'food-fuel' }, key))
            .rejects.toThrow('Your progress is saved');
        expect(callGemini).toHaveBeenCalledTimes(3);
        expect(graph.progress).toEqual(before);
        expect(db.rpc.mock.calls.some(c => c[0] === 'finish_graph_question')).toBe(false);
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
    it('releases the lease on provider failure without saving invalid evidence', async () => {
        const { db } = database(); vi.mocked(callGemini).mockRejectedValue(new Error('Provider unavailable'));
        await expect(handleJourney(db, 'user', { action: 'journey_question', nodeId: 'food-fuel' }, key)).rejects.toThrow(/Provider unavailable/);
        expect(db.rpc.mock.calls.some(c => c[0] === 'finish_graph_question')).toBe(false);
        expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
    });
});
