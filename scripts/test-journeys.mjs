import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
const { starterJourney } = await import(moduleUrl('supabase/functions/_shared/journeySeeds.ts'));
const { journeyView } = await import(moduleUrl('supabase/functions/_shared/journey.ts'));

export async function testJourneys({ db, rpc, scalar, check, denied }) {
  const rawRpc = rpc;
  rpc = (name, ...args) => rawRpc(name, ...args.map(arg => Array.isArray(arg) ? JSON.stringify(arg) : arg));
  const owner = randomUUID(), stranger = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, stranger]);
  const plan = starterJourney('Life');
  const saved = await rpc('save_graph_expansion', owner, 'Life', plan.nodes, 0);
  check((await rpc('save_graph_expansion', owner, 'Life', plan.nodes, 0)).nodes, saved.nodes);
  check((await rpc('load_learning_graph', stranger)).nodes, []);
  const view = row => journeyView(row);
  check(view(saved).nodes.length, 2);
  assert(!JSON.stringify(view(saved)).includes(plan.nodes.at(-1).title));
  await assert.rejects(rpc('begin_graph_question', owner, 'boss-life', 'mechanism'), /still hidden/);
  await assert.rejects(rpc('begin_graph_question', stranger, 'food-fuel', 'intuition'), /not found/);
  // Reusing still-unearned concepts from another topic adds only a boss.
  const crossBoss = { ...plan.nodes.at(-1), id: 'boss-physics', topic: 'Physics', title: 'How does feedback regulate a machine?' };
  const shared = await rpc('save_graph_expansion', owner, 'Physics', [crossBoss], 0);
  check(shared.nodes.length, 6);
  check(shared.nodes.filter(n => n.id === 'feedback').length, 1);
  await assert.rejects(rpc('begin_graph_question', owner, crossBoss.id, 'mechanism'), /still hidden/);
  check(await scalar("SELECT to_regclass('public.learning_journeys')"), null);
  await db.exec('SET ROLE authenticated');
  await denied('SELECT * FROM public.learning_graphs');
  await denied('SELECT public.load_learning_graph($1)', [owner]);
  await denied('SELECT public.save_graph_expansion($1,$2,$3,0)', [owner, 'Life', JSON.stringify(plan.nodes)]);
  await denied('SELECT public.record_learning_reward_answer($1,$2,0)', [owner, randomUUID()]);
  await denied('SELECT public.begin_graph_question($1,$2,$3)', [owner, 'food-fuel', 'intuition']);
  await db.exec('RESET ROLE');
  let serial = 0;
  const ask = async (node, facet) => {
    const lease = await rpc('begin_graph_question', owner, node, facet);
    return rpc('finish_graph_question', owner, lease.lease, lease.generation, node, facet, {
      question_text: `Fresh scenario ${++serial}`, options: ['Correct', 'Misconception 1', 'Misconception 2', 'Misconception 3'], correct_index: 0,
      explanation: 'A useful explanation.', knowledge_entry: `${node} ${facet}: earned insight.`, option_feedback: ['Correct reasoning.', 'Check this premise.', 'Check this premise.', 'Check this premise.'],
    });
  };
  await assert.rejects(rpc('begin_graph_question', owner, 'food-fuel', 'advanced'), /still hidden/);
  const first = await ask('food-fuel', 'intuition');
  check((await rpc('begin_graph_question', owner, 'food-fuel', 'intuition')).active.id, first.id);
  let answer = await rpc('record_question_answer', owner, first.id, 0);
  check(answer.graph.progress['food-fuel'].intuition.successes, 1);
  check(answer.graph.progress['food-fuel'].intuition.entry, 'food-fuel intuition: earned insight.');
  check((await rpc('record_question_answer', owner, first.id, 0)).graph.progress['food-fuel'].intuition.successes, 1);
  await assert.rejects(rpc('record_question_answer', owner, first.id, 1), /different selection/);
  await rpc('collect_learning_reward', owner, first.id);
  const wrong = await ask('food-fuel', 'intuition');
  answer = await rpc('record_question_answer', owner, wrong.id, 1);
  check(answer.graph.progress['food-fuel'].intuition.successes, 1);
  check(answer.graph.progress['food-fuel'].intuition.attempts, 2);
  check(answer.graph.progress['food-fuel'].intuition.entry, 'food-fuel intuition: earned insight.');
  await rpc('collect_learning_reward', owner, wrong.id);
  for (const node of ['food-fuel', 'cells', 'stores', 'feedback']) {
    for (const facet of plan.nodes.find(n => n.id === node).facets) {
      const needed = node === 'food-fuel' && facet === 'intuition' ? 1 : 2;
      for (let i = 0; i < needed; i++) {
        const q = await ask(node, facet);
        answer = await rpc('record_question_answer', owner, q.id, 0);
        await rpc('collect_learning_reward', owner, q.id);
      }
    }
    check(await scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [owner, plan.nodes.find(n => n.id === node).title]), 'proficient');
    if (node === 'food-fuel') { check(view(answer.graph).nodes.some(n => n.id === 'stores'), false); check(view(answer.graph).nodes.some(n => n.id === 'feedback'), false); }
  }
  const missedAdvanced = await ask('food-fuel', 'advanced');
  answer = await rpc('record_question_answer', owner, missedAdvanced.id, 1);
  check(answer.graph.progress['food-fuel'].advanced.successes, 0);
  await rpc('collect_learning_reward', owner, missedAdvanced.id);
  for (let i = 0; i < 3; i++) {
    const q = await ask('food-fuel', 'advanced');
    answer = await rpc('record_question_answer', owner, q.id, 0);
    check(answer.graph.progress['food-fuel'].advanced.successes, i + 1);
    check(answer.reward.calculation.lowValue, false);
    check((await rpc('record_question_answer', owner, q.id, 0)).graph.progress['food-fuel'].advanced.successes, i + 1);
    check(await scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [owner, plan.nodes[0].title]), i === 2 ? 'mastered' : 'proficient');
    await rpc('collect_learning_reward', owner, q.id);
  }
  check(view(answer.graph).nodes.some(n => n.kind === 'boss'), true);
  check((await rpc('kingdom_snapshot', owner)).state.libraryConcepts, 4);
  for (let i = 0; i < 1; i++) {
    const q = await ask('boss-life', 'mechanism');
    check(q.is_boss_question, true); check(q.required_concepts.length, 2);
    answer = await rpc('record_question_answer', owner, q.id, 0);
    await rpc('collect_learning_reward', owner, q.id);
  }
  check(view(answer.graph).nodes.find(n => n.id === 'boss-life').status, 'completed');
  // Both bosses unlock from the same concepts, independent of provenance.
  check(view(answer.graph).nodes.some(n => n.id === 'boss-physics'), true);
  await assert.rejects(rpc('begin_graph_question', owner, 'boss-life', 'mechanism'), /still hidden/);
  const nextBoss = { ...plan.nodes.at(-1), id: 'another-life-boss', title: 'How can the same concepts explain a new situation?' };
  const next = await rpc('save_graph_expansion', owner, 'Life', [nextBoss], 0);
  check(next.nodes.length, 7);
  check(next.progress['food-fuel'].advanced.successes, 3);
  check(view(next).nodes.some(n => n.id === nextBoss.id), true);
  check((await rpc('save_graph_expansion', owner, 'Life', [nextBoss], 0)).nodes.length, 7);
  // Concurrent/retried proposals never create two unanswered bosses for a topic.
  check((await rpc('save_graph_expansion', owner, 'Life', [{ ...nextBoss, id: 'racing-boss', title: 'A concurrent proposal?' }], 0)).nodes.length, 7);
  const crossQuestion = await ask('boss-physics', 'mechanism');
  check(crossQuestion.topic, 'Physics');
  answer = await rpc('record_question_answer', owner, crossQuestion.id, 0);
  await rpc('collect_learning_reward', owner, crossQuestion.id);
  // Duplicate concepts, missing parents and cycles cannot enter the graph.
  const badBoss = { ...nextBoss, id: 'bad-boss', topic: 'Physics', title: 'Invalid new question?' };
  await assert.rejects(rpc('save_graph_expansion', owner, 'Physics', [badBoss, { ...plan.nodes[0], id: 'duplicate' }], 0), /duplicating/);
  await assert.rejects(rpc('save_graph_expansion', owner, 'Physics', [{ ...badBoss, requires: [{ nodeId: 'missing', facets: plan.nodes[0].facets }, badBoss.requires[1]] }], 0), /prerequisite/);
  const cycle = { ...plan.nodes[0], id: 'cycle', title: 'A circular prerequisite', requires: [{ nodeId: 'cycle', facets: plan.nodes[0].facets }], prerequisiteConcepts: ['A circular prerequisite'] };
  await assert.rejects(rpc('save_graph_expansion', owner, 'Physics', [cycle, { ...badBoss, requires: [{ nodeId: 'cycle', facets: cycle.facets }, badBoss.requires[1]], prerequisiteConcepts: [cycle.title, plan.nodes[3].title] }], 0), /cycle/);
  // A retained entry requires a spaced success; a missed review never deletes it.
  await db.query(`UPDATE public.learning_graphs SET progress=jsonb_set(progress,'{food-fuel,intuition,nextReviewAt}',to_jsonb((now()-interval '2 days')::text)) WHERE user_id=$1`, [owner]);
  const review = await ask('food-fuel', 'intuition');
  answer = await rpc('record_question_answer', owner, review.id, 0);
  check(Boolean(answer.graph.progress['food-fuel'].intuition.retainedAt), true);
  check(answer.graph.progress['food-fuel'].intuition.reviewStep, 1);
  check(new Date(answer.graph.progress['food-fuel'].intuition.nextReviewAt) > new Date(Date.now()+2*86400000), true);
  await rpc('collect_learning_reward', owner, review.id);
  // Retention must recur; a later miss preserves mastery and schedules a short retry.
  await db.query(`UPDATE public.learning_graphs SET progress=jsonb_set(progress,'{food-fuel,intuition,nextReviewAt}',to_jsonb((now()-interval '1 hour')::text)) WHERE user_id=$1`, [owner]);
  const missedReview = await ask('food-fuel', 'intuition');
  answer = await rpc('record_question_answer', owner, missedReview.id, 1);
  check(answer.reward.calculation.due, true);
  check(answer.graph.progress['food-fuel'].intuition.reviewStep, 0);
  check(await scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [owner, plan.nodes[0].title]), 'mastered');
  await rpc('collect_learning_reward', owner, missedReview.id);
  // Deleted history cannot turn an already credited answer into fresh evidence.
  await db.query('DELETE FROM public.questions WHERE id=$1', [review.id]);
  const duplicateLease = await rpc('begin_graph_question', owner, 'food-fuel', 'intuition');
  await assert.rejects(rpc('finish_graph_question', owner, duplicateLease.lease, duplicateLease.generation, 'food-fuel', 'intuition', {
    question_text: review.question_text, options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: 'Explanation', knowledge_entry: 'Entry', option_feedback: ['A', 'B', 'C', 'D'],
  }), /already earned/);
  await rpc('cancel_question_generation', owner, duplicateLease.lease);
  const stale = await rpc('begin_graph_question', owner, 'cells', 'intuition');
  await rpc('reset_learning_progress', owner, 0);
  check((await rpc('load_learning_graph', owner)).nodes, []);
  await assert.rejects(rpc('save_graph_expansion', owner, 'Life', plan.nodes, 0), /reset/);
  await assert.rejects(rpc('finish_graph_question', owner, stale.lease, 0, 'cells', 'intuition', {}), /reset/);
  await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [owner, stranger]);
}

export async function testGraphRaces({ db, pool, rpc, check }) {
  const owner = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  try {
    const plan = starterJourney('Life');
    const proposals = Array.from({ length: 4 }, (_, i) => plan.nodes.map(n => n.kind === 'boss'
      ? { ...n, id: `racing-boss-${i}`, title: `${n.title} Scenario ${i}` } : n));
    const saves = await Promise.all(proposals.map(nodes => pool.query(
      'SELECT public.save_graph_expansion($1,$2,$3,0) AS graph', [owner, 'Life', JSON.stringify(nodes)])));
    const stored = await rpc('load_learning_graph', owner);
    check(stored.nodes.length, 5);
    for (const save of saves) check(save.rows[0].graph.nodes, stored.nodes);
    const boss = stored.nodes.find(n => n.kind === 'boss');
    const crossBoss = { ...boss, id: 'cross-topic-boss', topic: 'Physics', title: 'How can the same feedback regulate a machine?' };
    const crossSaves = await Promise.all(Array.from({ length: 4 }, () => pool.query(
      'SELECT public.save_graph_expansion($1,$2,$3,0) AS graph', [owner, 'Physics', JSON.stringify([crossBoss])])));
    for (const save of crossSaves) check(save.rows[0].graph.nodes.length, 6);
    check((await rpc('load_learning_graph', owner)).nodes.filter(n => n.id === 'feedback').length, 1);
    const lease = await rpc('begin_graph_question', owner, 'food-fuel', 'intuition');
    const q = await rpc('finish_graph_question', owner, lease.lease, 0, 'food-fuel', 'intuition', {
      question_text: 'A shared concept scenario', options: ['A', 'B', 'C', 'D'], correct_index: 0,
      explanation: 'A useful explanation.', knowledge_entry: 'A shared insight.', option_feedback: ['A', 'B', 'C', 'D'],
    });
    const answers = await Promise.all(Array.from({ length: 4 }, () => pool.query(
      'SELECT public.record_question_answer($1,$2,0) AS result', [owner, q.id])));
    for (const answer of answers) check(answer.rows[0].result.graph.progress['food-fuel'].intuition.successes, 1);
    await rpc('reset_learning_progress', owner, 0);
    const stale = await Promise.allSettled(proposals.map(nodes => pool.query(
      'SELECT public.save_graph_expansion($1,$2,$3,0)', [owner, 'Life', JSON.stringify(nodes)])));
    check(stale.every(result => result.status === 'rejected' && /reset/.test(result.reason.message)), true);
    check((await rpc('load_learning_graph', owner)).nodes, []);
  } finally { await db.query('DELETE FROM auth.users WHERE id=$1', [owner]); }
}
