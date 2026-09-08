import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleJourney } from '../../supabase/functions/learning/journey';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));

const plan = starterJourney('Life');
const row = { id: 'journey', chapter: 1, plan, progress: {} };
const key = vi.fn().mockResolvedValue('test-key');
const question = { question: 'How can food help a body do work?', options: ['It provides chemical energy.', 'It creates energy from nothing.', 'It replaces air.', 'It stops the need for rest.'],
  correctIndex: 0, explanation: 'Food contains chemical energy that cells can use.', knowledgeEntry: 'Food supplies energy for activity.',
  optionFeedback: ['Energy can be transferred.', 'Energy is not created from nothing.', 'Air still matters.', 'Rest still matters.'], assumedConcepts: [], suggestedQuestions: ['What is energy?', 'What do cells do?'] };

describe('Journey generation service', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(callGemini).mockResolvedValue(JSON.stringify(question)); });
  it('persists an authored chapter before projecting it, without requiring a key', async () => {
    const calls: string[] = [];
    const db = { rpc: vi.fn(async (name: string) => {
      calls.push(name);
      return { data: name === 'load_learning_journey' ? null : name === 'kingdom_snapshot' ? { generation: 0 } : name === 'save_learning_journey' ? row : [{ id: row.id, chapter: 1 }], error: null };
    }) };
    const result = await handleJourney(db, 'user', { action: 'journey', topic: 'Life' }, key);
    expect(calls).toEqual(['load_learning_journey', 'kingdom_snapshot', 'save_learning_journey', 'list_learning_journeys']);
    expect(JSON.stringify(result)).not.toContain(plan.nodes.at(-1)!.title);
    expect(key).not.toHaveBeenCalled(); expect(callGemini).not.toHaveBeenCalled();
  });
  it('reuses a saved chapter and never replaces its hidden question on reload', async () => {
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === 'load_learning_journey' ? row : [], error: null })) };
    await handleJourney(db, 'user', { action: 'journey', topic: 'Life' }, key);
    expect(db.rpc.mock.calls.map(c => c[0])).toEqual(['load_learning_journey', 'list_learning_journeys']);
    expect(callGemini).not.toHaveBeenCalled();
  });
  it('reuses an active question without asking Gemini, and refuses unavailable chapter ids', async () => {
    const db = { rpc: vi.fn(async () => ({ data: { active: { id: 'active' } }, error: null })) };
    expect(await handleJourney(db, 'user', { action: 'journey_question', journeyId: row.id, nodeId: 'food-fuel', facet: 'intuition' }, key)).toEqual({ questionRow: { id: 'active' } });
    expect(callGemini).not.toHaveBeenCalled();
    const missing = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    await expect(handleJourney(missing, 'user', { action: 'journey', topic: 'Life', journeyId: 'another-account' }, key)).rejects.toThrow(/unavailable/);
  });
  it('retries unknown prerequisites and saves aligned option feedback before returning a question', async () => {
    vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify({ ...question, assumedConcepts: ['Allosteric enzymes'] }));
    let saved: Record<string, unknown> | undefined;
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'begin_journey_question') return { data: { lease: 'lease', generation: 0, journey: row, node: plan.nodes[0] }, error: null };
      if (name === 'journey_question_history') return { data: [], error: null };
      if (name === 'finish_journey_question') { saved = args.p_question as Record<string, unknown>; return { data: { ...saved, id: 'issued' }, error: null }; }
      return { data: true, error: null };
    }) };
    await handleJourney(db, 'user', { action: 'journey_question', journeyId: row.id, nodeId: 'food-fuel', facet: 'intuition' }, key);
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(callGemini).toHaveBeenLastCalledWith('test-key', expect.stringContaining('unearned concept'), expect.anything());
    const options = saved!.options as string[]; const feedback = saved!.option_feedback as string[];
    for (let i = 0; i < 4; i++) expect(feedback[i]).toBe(question.optionFeedback[question.options.indexOf(options[i])]);
    expect(options[saved!.correct_index as number]).toBe(question.options[0]);
    expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
  });
  it('releases the lease on a failed provider request and never saves invalid evidence', async () => {
    vi.mocked(callGemini).mockRejectedValue(new Error('Provider unavailable'));
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === 'begin_journey_question' ? { lease: 'lease', generation: 0, journey: row, node: plan.nodes[0] } : name === 'journey_question_history' ? [] : true, error: null })) };
    await expect(handleJourney(db, 'user', { action: 'journey_question', journeyId: row.id, nodeId: 'food-fuel', facet: 'intuition' }, key)).rejects.toThrow(/Provider unavailable/);
    expect(db.rpc.mock.calls.some(c => c[0] === 'finish_journey_question')).toBe(false);
    expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
  });
  it('rejects a semantically incomplete chapter before saving and retries the prerequisite audit', async () => {
    const complete = { ...row, progress: Object.fromEntries(plan.nodes.map(n => [n.id, Object.fromEntries(n.facets.map(f => [f, { attempts: 2, successes: 2 }]))])) };
    const next = structuredClone(plan);
    next.nodes.forEach(n => { n.title = `Next ${n.title}`; n.prerequisiteConcepts = n.prerequisiteConcepts?.map(name => `Next ${name}`); });
    vi.mocked(callGemini)
      .mockResolvedValueOnce(JSON.stringify(next))
      .mockResolvedValueOnce(JSON.stringify({ issues: ['Formal precision assumes an untaught rate concept.'] }))
      .mockResolvedValueOnce(JSON.stringify(next))
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }));
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data: name === 'load_learning_journey' ? complete : name === 'list_learning_journeys' ? [] : name === 'kingdom_snapshot' ? { generation: 0 }
        : name === 'save_learning_journey' ? { ...row, id: 'next', chapter: 2, plan: args.p_plan } : true,
      error: null,
    })) };
    await handleJourney(db, 'user', { action: 'journey_next', topic: 'Life', journeyId: row.id }, key);
    expect(callGemini).toHaveBeenCalledTimes(4);
    expect(vi.mocked(callGemini).mock.calls[2][1]).toContain('untaught rate concept');
    expect(db.rpc.mock.calls.filter(c => c[0] === 'save_learning_journey')).toHaveLength(1);
  });
});
