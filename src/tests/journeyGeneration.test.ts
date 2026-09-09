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
  it('generates and audits initial foundations before saving, with no fixed starter roots', async () => {
    vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValueOnce(JSON.stringify({ blockers: [], suggestions: [] }));
    const calls: string[] = [];
    const db = { rpc: vi.fn(async (name: string) => {
      calls.push(name);
      return { data: name === 'load_learning_journey' ? null : name === 'kingdom_snapshot' ? { generation: 0 } : name === 'save_learning_journey' ? row : name === 'consume_backend_rate_limit' ? true : [], error: null };
    }) };
    const result = await handleJourney(db, 'user', { action: 'journey', topic: 'Life' }, key);
    expect(calls).toContain('save_learning_journey');
    expect(JSON.stringify(result)).not.toContain(plan.nodes.at(-1)!.title);
    expect(key).toHaveBeenCalledOnce(); expect(callGemini).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callGemini).mock.calls[0][1]).toContain('There is no fixed list of basic concepts');
  });
  it('reuses a saved chapter and never replaces its hidden question on reload', async () => {
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === 'load_learning_journey' ? row : [], error: null })) };
    await handleJourney(db, 'user', { action: 'journey', topic: 'Life' }, key);
    expect(db.rpc.mock.calls.map(c => c[0])).toEqual(['load_learning_journey', 'list_learning_journeys']);
    expect(callGemini).not.toHaveBeenCalled();
  });
  it('issues the first question from a narrow fungi chapter despite nonblocking vocabulary and breadth suggestions', async () => {
    const fungi = structuredClone(plan);
    fungi.title = 'Life beneath our feet';
    const descriptions = [
      ['Fungal Network', 'A fungus can grow as thread-like structures that spread through soil and reach nearby materials.'],
      ['Materials for growth', 'Living things take in materials from their surroundings to grow.'],
      ['Nutrient Exchange', 'Some fungi and plants exchange chemical building blocks. This exchange can be reciprocal: materials pass in both directions.'],
      ['Chemical Signaling', 'Small bits of material can carry signals, or molecular messages, that help living things coordinate their responses.'],
      ['How can a fungus and a plant help each other grow?', 'A fungus can reach soil materials a plant needs, while a plant can supply materials the fungus needs.'],
    ];
    fungi.nodes.forEach((n, i) => { [n.title, n.definition] = descriptions[i]; });
    fungi.nodes.forEach(n => { n.prerequisiteConcepts = n.requires.map(r => fungi.nodes.find(p => p.id === r.nodeId)!.title); });
    const firstQuestion = { ...question, question: 'A fungus grows many thin threads through soil. How might this help it find material to grow?',
      options: ['The threads reach more places in the soil.', 'The threads turn every stone into food.', 'The threads prevent all contact with soil.', 'The threads mean it no longer needs material.'],
      explanation: 'Spreading threads can reach materials in more places.', knowledgeEntry: 'Fungal threads spread through their surroundings and reach materials for growth.',
      optionFeedback: ['Spreading gives access to more places.', 'Stones do not all turn into food.', 'Threads contact the soil around them.', 'Growing still needs material.'] };
    vi.mocked(callGemini)
      .mockResolvedValueOnce(JSON.stringify(fungi))
      .mockResolvedValueOnce(JSON.stringify({ blockers: [], suggestions: [
        'Explain thread-like structures in everyday language.',
        'Explain chemical building blocks and reciprocal inline.',
        'Simplify molecular messages and coordinate.',
        'Explore animals, human anatomy, medicine, and genetics in future chapters.',
      ] }))
      .mockResolvedValueOnce(JSON.stringify(firstQuestion));
    let saved: typeof row | undefined;
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      let data: unknown = true;
      if (name === 'load_all_learning_journeys') data = saved ? [saved] : [];
      if (name === 'load_learning_journey' || name === 'load_journey_by_id') data = saved ?? null;
      if (name === 'kingdom_snapshot') data = { generation: 0 };
      if (name === 'list_learning_journeys' || name === 'journey_question_history') data = [];
      if (name === 'save_learning_journey') { saved = { ...row, plan: args.p_plan as typeof plan }; data = saved; }
      if (name === 'begin_journey_question') data = { lease: 'lease', generation: 0, journey: saved, node: saved!.plan.nodes.find(n => n.id === args.p_node) };
      if (name === 'finish_journey_question') data = { id: 'issued', ...args.p_question as object };
      return { data, error: null };
    }) };
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const result = await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
      expect(result).toMatchObject({ questionRow: { id: 'issued', question_text: firstQuestion.question } });
      expect(JSON.stringify(result)).not.toContain(fungi.nodes.at(-1)!.title);
    } finally { random.mockRestore(); }
    expect(callGemini).toHaveBeenCalledTimes(3);
    expect(db.rpc.mock.calls.filter(c => c[0] === 'save_learning_journey')).toHaveLength(1);
    expect(vi.mocked(callGemini).mock.calls[1][1]).toContain('missing unrelated subfields is NEVER a blocker');
    expect(vi.mocked(callGemini).mock.calls[2][1]).toContain('brief inline definition');
  });
  it('keeps substantive failures blocking after three repairs without exposing private concepts', async () => {
    const blocker = { kind: 'factual_error', nodeId: plan.nodes[0].id, evidence: plan.nodes[0].title,
      reason: 'The stated relationship is incorrect.', fix: 'Correct the relationship before teaching it.' };
    vi.mocked(callGemini).mockImplementation(async (_key, _prompt, schema) =>
      JSON.stringify(schema && 'blockers' in (schema.properties as object) ? { blockers: [blocker], suggestions: [] } : plan));
    const db = { rpc: vi.fn(async (name: string) => ({
      data: name === 'load_learning_journey' ? null : name === 'kingdom_snapshot' ? { generation: 0 } : name === 'load_all_learning_journeys' ? [] : true,
      error: null,
    })) };
    await expect(handleJourney(db, 'user', { action: 'journey', topic: 'Life' }, key))
      .rejects.toThrow('We could not prepare an accessible chapter this time. Please try again.');
    expect(callGemini).toHaveBeenCalledTimes(6);
    expect(db.rpc.mock.calls.some(c => c[0] === 'save_learning_journey')).toBe(false);
  });
  it('reuses an active question without asking Gemini, and refuses unavailable chapter ids', async () => {
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === 'load_journey_by_id' ? row : { active: { id: 'active' } }, error: null })) };
    expect(await handleJourney(db, 'user', { action: 'journey_question', journeyId: row.id, nodeId: 'food-fuel', facet: 'intuition' }, key)).toEqual({ questionRow: { id: 'active' } });
    expect(callGemini).not.toHaveBeenCalled();
    const missing = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    await expect(handleJourney(missing, 'user', { action: 'journey', topic: 'Life', journeyId: 'another-account' }, key)).rejects.toThrow(/unavailable/);
  });
  it('retries unknown prerequisites and saves aligned option feedback before returning a question', async () => {
    vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify({ ...question, assumedConcepts: ['Allosteric enzymes'] }));
    let saved: Record<string, unknown> | undefined;
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'load_journey_by_id') return { data: row, error: null };
      if (name === 'begin_journey_question') return { data: { lease: 'lease', generation: 0, journey: row, node: plan.nodes[0] }, error: null };
      if (name === 'journey_question_history') return { data: [], error: null };
      if (name === 'finish_journey_question') { saved = args.p_question as Record<string, unknown>; return { data: { ...saved, id: 'issued' }, error: null }; }
      return { data: true, error: null };
    }) };
    await handleJourney(db, 'user', { action: 'journey_question', journeyId: row.id, nodeId: 'food-fuel', facet: 'advanced' }, key);
    expect(db.rpc).toHaveBeenCalledWith('begin_journey_question', expect.objectContaining({ p_facet: 'intuition' }));
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(callGemini).toHaveBeenLastCalledWith('test-key', expect.stringContaining('unearned concept'), expect.anything());
    const options = saved!.options as string[]; const feedback = saved!.option_feedback as string[];
    for (let i = 0; i < 4; i++) expect(feedback[i]).toBe(question.optionFeedback[question.options.indexOf(options[i])]);
    expect(options[saved!.correct_index as number]).toBe(question.options[0]);
    expect(db.rpc.mock.calls.at(-1)?.[0]).toBe('cancel_question_generation');
  });
  it('releases the lease on a failed provider request and never saves invalid evidence', async () => {
    vi.mocked(callGemini).mockRejectedValue(new Error('Provider unavailable'));
    const db = { rpc: vi.fn(async (name: string) => ({ data: name === 'load_journey_by_id' ? row : name === 'begin_journey_question' ? { lease: 'lease', generation: 0, journey: row, node: plan.nodes[0] } : name === 'journey_question_history' ? [] : true, error: null })) };
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
      .mockResolvedValueOnce(JSON.stringify({ blockers: [{ kind: 'missing_prerequisite', nodeId: next.nodes[0].id, evidence: next.nodes[0].title,
        reason: 'Formal precision assumes an untaught rate concept.', fix: 'Teach rates first or keep the explanation qualitative.' }], suggestions: [] }))
      .mockResolvedValueOnce(JSON.stringify(next))
      .mockResolvedValueOnce(JSON.stringify({ blockers: [], suggestions: [] }));
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
      data: name === 'load_all_learning_journeys' ? [complete] : name === 'load_learning_journey' ? complete : name === 'list_learning_journeys' ? [] : name === 'kingdom_snapshot' ? { generation: 0 }
        : name === 'save_learning_journey' ? { ...row, id: 'next', chapter: 2, plan: args.p_plan } : true,
      error: null,
    })) };
    await handleJourney(db, 'user', { action: 'journey_next', topic: 'Life', journeyId: row.id }, key);
    expect(callGemini).toHaveBeenCalledTimes(4);
    expect(vi.mocked(callGemini).mock.calls[2][1]).toContain('untaught rate concept');
    expect(db.rpc.mock.calls.filter(c => c[0] === 'save_learning_journey')).toHaveLength(1);
  });
  it('loads all topics for the graph without generating or exposing hidden questions', async () => {
    const db = { rpc: vi.fn(async () => ({ data: [row], error: null })) };
    const result = await handleJourney(db, 'user', { action: 'knowledge_graph' }, key);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(callGemini).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(plan.nodes.at(-1)!.title);
  });
  it('automatically grows a completed topic once and then reuses its waiting chapter', async () => {
    const complete = { ...row, progress: Object.fromEntries(plan.nodes.map(n => [n.id, Object.fromEntries(n.facets.map(f => [f, { attempts: 2, successes: n.kind === 'boss' ? 1 : 2 }]))])) };
    const next = structuredClone(plan);
    next.nodes.forEach(n => { n.title = `Next ${n.title}`; n.prerequisiteConcepts = n.prerequisiteConcepts?.map(name => `Next ${name}`); });
    let rows = [complete];
    const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      let data: unknown = true;
      if (name === 'load_all_learning_journeys') data = rows;
      if (name === 'load_learning_journey' || name === 'load_journey_by_id') data = args.p_id ? rows.find(j => j.id === args.p_id) ?? null : rows.at(-1);
      if (name === 'list_learning_journeys') data = rows.map(j => ({ id: j.id, chapter: j.chapter }));
      if (name === 'kingdom_snapshot') data = { generation: 0 };
      if (name === 'save_learning_journey') {
        const fresh = { ...row, id: 'next', chapter: 2, plan: args.p_plan as typeof plan, progress: {} };
        rows = [...rows, fresh]; data = fresh;
      }
      if (name === 'begin_journey_question') data = { active: { id: 'question' } };
      return { data, error: null };
    }) };
    vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(next)).mockResolvedValueOnce(JSON.stringify({ blockers: [], suggestions: [] }));
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    try {
      await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
      expect(db.rpc).toHaveBeenCalledWith('begin_journey_question', expect.objectContaining({ p_journey_id: row.id }));
      random.mockReturnValue(0.99);
      await handleJourney(db, 'user', { action: 'journey_practice', topic: 'Life' }, key);
      expect(db.rpc).toHaveBeenLastCalledWith('begin_journey_question', expect.objectContaining({ p_journey_id: 'next' }));
    } finally { random.mockRestore(); }
    expect(rows).toHaveLength(2);
    expect(callGemini).toHaveBeenCalledTimes(2);
    expect(db.rpc.mock.calls.filter(c => c[0] === 'save_learning_journey')).toHaveLength(1);
  });

});
