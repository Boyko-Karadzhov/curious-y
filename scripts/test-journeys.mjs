import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
const { preparedJourney: starterJourney, prepareFixtureNode } = await import(moduleUrl('src/tests/fixtures/preparedJourney.ts'));
const { DIMENSION_ORDER, journeyView } = await import(moduleUrl('supabase/functions/_shared/journey.ts'));
const { REASONING_COMPLEXITIES } = await import(moduleUrl('supabase/functions/_shared/reasoning.ts'));

export async function testJourneys(h) {
  const state = {};
  const steps = [initializeGraph, verifySharedGraph, verifyGraphPrivacy, checkInitialAnswers, prepareFoundation, masterFoundation, learnDependentConcepts, conquerFirstBoss, verifyBossContinuation, checkInvalidGraphAndRetention, checkMissedReviews, verifyReplayAndReset];
  for (const step of steps) {
    await step(h, state);
  }
}

async function initializeGraph(h, s) {
  s.rawRpc = h.rpc;
  h.rpc = (name, ...args) => s.rawRpc(name, ...args.map(arg => Array.isArray(arg) ? JSON.stringify(arg) : arg));
  s.owner = randomUUID();
  s.stranger = randomUUID();
  await h.db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [s.owner, s.stranger]);
  s.plan = starterJourney('Life');
  s.saved = await h.rpc('save_graph_expansion', s.owner, 'Life', s.plan.nodes, 0);
  h.check((await h.rpc('save_graph_expansion', s.owner, 'Life', s.plan.nodes, 0)).nodes, s.saved.nodes);
  h.check((await h.rpc('load_learning_graph', s.stranger)).nodes, []);
  s.view = row => journeyView(row);
  h.check(s.view(s.saved).nodes.length, 2);
}

async function verifySharedGraph(h, s) {
  assert(!JSON.stringify(s.view(s.saved)).includes(s.plan.nodes.at(-1).title));
  await assert.rejects(h.rpc('begin_graph_question', s.owner, 'boss-life', null, null), /still hidden/);
  await assert.rejects(h.rpc('begin_graph_question', s.stranger, 'food-fuel', 'intuition', null), /not found/);
  s.crossBoss = prepareFixtureNode({ ...s.plan.nodes.at(-1), id: 'boss-physics', topic: 'Physics', title: 'How does feedback regulate a machine?' });
  s.shared = await h.rpc('save_graph_expansion', s.owner, 'Physics', [s.crossBoss], 0);
  h.check(s.shared.nodes.length, 6);
  h.check(s.shared.nodes.filter(n => n.id === 'feedback').length, 1);
  const strangerBoss = prepareFixtureNode({ ...s.plan.nodes.at(-1), id: 'stranger-boss', title: 'How does this system regulate another organism?' });
  const strangerGraph = await h.rpc('save_graph_expansion', s.stranger, 'Life', [strangerBoss], 0);
  h.check(strangerGraph.nodes.map(n => n.id).sort(), ['cells', 'feedback', 'food-fuel', 'stores', 'stranger-boss'].sort());
  await assert.rejects(h.rpc('begin_graph_question', s.owner, s.crossBoss.id, null, null), /still hidden/);
  h.check(await h.scalar("SELECT to_regclass('public.learning_journeys')"), null);
  await h.db.exec('SET ROLE authenticated');
}

async function verifyGraphPrivacy(h, s) {
  await h.denied('SELECT * FROM public.learning_graphs');
  await h.denied('SELECT public.load_learning_graph($1)', [s.owner]);
  await h.denied('SELECT public.save_graph_expansion($1,$2,$3,0)', [s.owner, 'Life', JSON.stringify(s.plan.nodes)]);
  await h.denied('SELECT public.record_learning_reward_answer($1,$2,0)', [s.owner, randomUUID()]);
  await h.denied('SELECT public.begin_graph_question($1,$2,$3,$4)', [s.owner, 'food-fuel', 'intuition', null]);
  await h.db.exec('RESET ROLE');
  s.serial = 0;
  s.ask = async (node, dimension = null, reasoning = null) => {
      const lease = await h.rpc('begin_graph_question', s.owner, node, dimension, reasoning);
      const isBoss = node.startsWith('boss-');
      const entry = dimension ? s.plan.nodes.find(item => item.id === node)?.dimensions?.[dimension] ?? `${dimension} knowledge` : undefined;
      return h.rpc('finish_graph_question', s.owner, lease.lease, lease.generation, node, dimension, reasoning, {
          question_text: isBoss ? (node === 'boss-life' ? s.plan.nodes.at(-1).title : s.crossBoss.title) : `Fresh scenario ${++s.serial}`, options: ['Correct', 'Misconception 1', 'Misconception 2', 'Misconception 3'], correct_index: 0,
          explanation: 'A useful explanation.', ...(entry ? { knowledge_entry: entry } : {}), option_feedback: ['Correct reasoning.', 'Check this premise.', 'Check this premise.', 'Check this premise.'],
      });
  };
  await assert.rejects(h.rpc('begin_graph_question', s.owner, 'food-fuel', null, 'directInference'), /still hidden/);
  s.first = await s.ask('food-fuel', 'intuition');
}

async function checkInitialAnswers(h, s) {
  h.check((await h.rpc('begin_graph_question', s.owner, 'food-fuel', 'intuition', null)).active.id, s.first.id);
  s.answer = await h.rpc('record_question_answer', s.owner, s.first.id, 0);
  h.check(s.answer.graph.progress['food-fuel'].intuition.successes, 1);
  h.check(s.answer.graph.progress['food-fuel'].intuition.entry, s.plan.nodes[0].dimensions.intuition);
  h.check((await h.rpc('record_question_answer', s.owner, s.first.id, 0)).graph.progress['food-fuel'].intuition.successes, 1);
  await assert.rejects(h.rpc('record_question_answer', s.owner, s.first.id, 1), /different selection/);
  await h.rpc('collect_learning_reward', s.owner, s.first.id);
  s.wrong = await s.ask('food-fuel', 'intuition');
  s.answer = await h.rpc('record_question_answer', s.owner, s.wrong.id, 1);
  h.check(s.answer.graph.progress['food-fuel'].intuition.successes, 1);
}

async function prepareFoundation(h, s) {
  h.check(s.answer.graph.progress['food-fuel'].intuition.attempts, 2);
  h.check(s.answer.graph.progress['food-fuel'].intuition.entry, s.plan.nodes[0].dimensions.intuition);
  await h.rpc('collect_learning_reward', s.owner, s.wrong.id);
  s.learnDimensions = async (node) => {
      for (const dimension of DIMENSION_ORDER) {
          const q = await s.ask(node, dimension);
          s.answer = await h.rpc('record_question_answer', s.owner, q.id, 0);
          await h.rpc('collect_learning_reward', s.owner, q.id);
      }
      h.check(await h.scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [s.owner, s.plan.nodes.find(n => n.id === node).title]), 'proficient');
  };
  await s.learnDimensions('food-fuel');
  h.check(s.view(s.answer.graph).nodes.some(n => n.id === 'stores'), false);
  s.missedReasoning = await s.ask('food-fuel', null, 'directInference');
  s.answer = await h.rpc('record_question_answer', s.owner, s.missedReasoning.id, 1);
  h.check(s.answer.graph.progress['food-fuel'].directInference.successes, 0);
  await h.rpc('collect_learning_reward', s.owner, s.missedReasoning.id);
}

async function masterFoundation(h, s) {
  for (const [index, complexity] of REASONING_COMPLEXITIES.entries()) {
      const q = await s.ask('food-fuel', null, complexity);
      s.answer = await h.rpc('record_question_answer', s.owner, q.id, 0);
      h.check(s.answer.graph.progress['food-fuel'][complexity].successes, 1);
      h.check(s.answer.reward.calculation.lowValue, false);
      h.check((await h.rpc('record_question_answer', s.owner, q.id, 0)).graph.progress['food-fuel'][complexity].successes, 1);
      h.check(await h.scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [s.owner, s.plan.nodes[0].title]), index === REASONING_COMPLEXITIES.length - 1 ? 'mastered' : 'proficient');
      await h.rpc('collect_learning_reward', s.owner, q.id);
  }
}

async function learnDependentConcepts(h, s) {
  for (const node of ['cells', 'stores', 'feedback']) {
      await s.learnDimensions(node);
      for (const complexity of REASONING_COMPLEXITIES) {
          const q = await s.ask(node, null, complexity);
          s.answer = await h.rpc('record_question_answer', s.owner, q.id, 0);
          await h.rpc('collect_learning_reward', s.owner, q.id);
      }
  }
  h.check(s.view(s.answer.graph).nodes.some(n => n.kind === 'boss'), true);
  h.check((await h.rpc('kingdom_snapshot', s.owner)).state.libraryConcepts, 4);
}

async function conquerFirstBoss(h, s) {
  for (let i = 0; i < 1; i++) {
      const q = await s.ask('boss-life');
      h.check(q.is_boss_question, true);
      h.check(q.knowledge_entry, null);
      h.check(q.required_concepts.length, 2);
      s.answer = await h.rpc('record_question_answer', s.owner, q.id, 0);
      await h.rpc('collect_learning_reward', s.owner, q.id);
  }
  h.check(s.view(s.answer.graph).nodes.find(n => n.id === 'boss-life').status, 'completed');
  // Both bosses unlock from the same concepts, independent of provenance.
  h.check(s.view(s.answer.graph).nodes.some(n => n.id === 'boss-physics'), true);
  await assert.rejects(h.rpc('begin_graph_question', s.owner, 'boss-life', null, null), /still hidden/);
  s.nextBoss = prepareFixtureNode({ ...s.plan.nodes.at(-1), id: 'another-life-boss', title: 'How can the same concepts explain a new situation?' });
}

async function verifyBossContinuation(h, s) {
  s.next = await h.rpc('save_graph_expansion', s.owner, 'Life', [s.nextBoss], 0);
  h.check(s.next.nodes.length, 7);
  h.check(s.next.progress['food-fuel'].derivation.successes, 1);
  h.check(s.view(s.next).nodes.some(n => n.id === s.nextBoss.id), true);
  h.check((await h.rpc('save_graph_expansion', s.owner, 'Life', [s.nextBoss], 0)).nodes.length, 7);
  // Concurrent/retried proposals never create two unanswered bosses for a topic.
  h.check((await h.rpc('save_graph_expansion', s.owner, 'Life', [{ ...s.nextBoss, id: 'racing-boss', title: 'A concurrent proposal?' }], 0)).nodes.length, 7);
  s.crossQuestion = await s.ask('boss-physics');
  h.check(s.crossQuestion.topic, 'Physics');
  s.answer = await h.rpc('record_question_answer', s.owner, s.crossQuestion.id, 0);
  await h.rpc('collect_learning_reward', s.owner, s.crossQuestion.id);
}

async function checkInvalidGraphAndRetention(h, s) {
  s.badBoss = prepareFixtureNode({ ...s.nextBoss, id: 'bad-boss', topic: 'Physics', title: 'Invalid new question?' });
  const reused = await h.rpc('save_graph_expansion', s.owner, 'Physics', [{ ...s.plan.nodes[0], id: 'duplicate' }], 0);
  h.check(reused.nodes.some(node => node.id === 'duplicate'), false);
  h.check(reused.nodes.filter(node => node.title === s.plan.nodes[0].title).length, 1);
  await assert.rejects(h.rpc('save_graph_expansion', s.owner, 'Physics', [{ ...s.badBoss, requires: [{ nodeId: 'missing' }, s.badBoss.requires[1]] }], 0), /prerequisite/);
  await assert.rejects(h.rpc('save_graph_expansion', s.owner, 'Physics', [{ ...s.badBoss, requires: [{ ...s.badBoss.requires[0], extra: true }, s.badBoss.requires[1]] }], 0), /prerequisite/);
  s.cycle = { ...s.plan.nodes[0], id: 'cycle', title: 'A circular prerequisite', requires: [{ nodeId: 'cycle' }] };
  await assert.rejects(h.rpc('save_graph_expansion', s.owner, 'Physics', [s.cycle, { ...s.badBoss, requires: [{ nodeId: 'cycle' }, s.badBoss.requires[1]] }], 0), /cycle/);
  // A retained entry requires a spaced success; a missed review never deletes it.
  await h.db.query(`UPDATE public.learning_graphs SET progress=jsonb_set(progress,'{food-fuel,intuition,nextReviewAt}',to_jsonb((now()-interval '2 days')::text)) WHERE user_id=$1`, [s.owner]);
  s.review = await s.ask('food-fuel', 'intuition');
  s.answer = await h.rpc('record_question_answer', s.owner, s.review.id, 0);
  h.check(Boolean(s.answer.graph.progress['food-fuel'].intuition.retainedAt), true);
  h.check(s.answer.graph.progress['food-fuel'].intuition.reviewStep, 1);
}

async function checkMissedReviews(h, s) {
  h.check(new Date(s.answer.graph.progress['food-fuel'].intuition.nextReviewAt) > new Date(Date.now() + 2 * 86400000), true);
  await h.rpc('collect_learning_reward', s.owner, s.review.id);
  // Retention must recur; a later miss preserves mastery and schedules a short retry.
  await h.db.query(`UPDATE public.learning_graphs SET progress=jsonb_set(progress,'{food-fuel,intuition,nextReviewAt}',to_jsonb((now()-interval '1 hour')::text)) WHERE user_id=$1`, [s.owner]);
  s.missedReview = await s.ask('food-fuel', 'intuition');
  s.answer = await h.rpc('record_question_answer', s.owner, s.missedReview.id, 1);
  h.check(s.answer.reward.calculation.due, true);
  h.check(s.answer.graph.progress['food-fuel'].intuition.reviewStep, 0);
  h.check(await h.scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [s.owner, s.plan.nodes[0].title]), 'mastered');
  await h.rpc('collect_learning_reward', s.owner, s.missedReview.id);
  // Deleted history cannot turn an already credited answer into fresh evidence.
  await h.db.query('DELETE FROM public.questions WHERE id=$1', [s.review.id]);
}

async function verifyReplayAndReset(h, s) {
  s.duplicateLease = await h.rpc('begin_graph_question', s.owner, 'food-fuel', 'intuition', null);
  await assert.rejects(h.rpc('finish_graph_question', s.owner, s.duplicateLease.lease, s.duplicateLease.generation, 'food-fuel', 'intuition', null, {
      question_text: s.review.question_text, options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: 'Explanation', knowledge_entry: s.plan.nodes[0].dimensions.intuition, option_feedback: ['A', 'B', 'C', 'D'],
  }), /already earned/);
  await h.rpc('cancel_question_generation', s.owner, s.duplicateLease.lease);
  s.stale = await h.rpc('begin_graph_question', s.owner, 'cells', 'intuition', null);
  await h.rpc('reset_learning_progress', s.owner, 0);
  h.check((await h.rpc('load_learning_graph', s.owner)).nodes, []);
  await assert.rejects(h.rpc('save_graph_expansion', s.owner, 'Life', s.plan.nodes, 0), /reset/);
  await assert.rejects(h.rpc('finish_graph_question', s.owner, s.stale.lease, 0, 'cells', 'intuition', null, {}), /reset/);
  await h.db.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [s.owner, s.stranger]);
}


export async function testGraphRaces({ db, pool, rpc, check }) {
  const owner = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  try {
    const plan = starterJourney('Life');
    const proposals = Array.from({ length: 4 }, (_, i) => plan.nodes.map(n => n.kind === 'boss'
      ? prepareFixtureNode({ ...n, id: `racing-boss-${i}`, title: `${n.title} Scenario ${i}` }) : n));
    const saves = await Promise.all(proposals.map(nodes => pool.query(
      'SELECT public.save_graph_expansion($1,$2,$3,0) AS graph', [owner, 'Life', JSON.stringify(nodes)])));
    const stored = await rpc('load_learning_graph', owner);
    check(stored.nodes.length, 5);
    for (const save of saves) check(save.rows[0].graph.nodes, stored.nodes);
    const boss = stored.nodes.find(n => n.kind === 'boss');
    const crossBoss = prepareFixtureNode({ ...boss, id: 'cross-topic-boss', topic: 'Physics', title: 'How can the same feedback regulate a machine?' });
    const crossSaves = await Promise.all(Array.from({ length: 4 }, () => pool.query(
      'SELECT public.save_graph_expansion($1,$2,$3,0) AS graph', [owner, 'Physics', JSON.stringify([crossBoss])])));
    for (const save of crossSaves) check(save.rows[0].graph.nodes.length, 6);
    check((await rpc('load_learning_graph', owner)).nodes.filter(n => n.id === 'feedback').length, 1);
    const lease = await rpc('begin_graph_question', owner, 'food-fuel', 'intuition', null);
    const q = await rpc('finish_graph_question', owner, lease.lease, 0, 'food-fuel', 'intuition', null, {
      question_text: 'A shared concept scenario', options: ['A', 'B', 'C', 'D'], correct_index: 0,
      explanation: 'A useful explanation.', knowledge_entry: plan.nodes[0].dimensions.intuition, option_feedback: ['A', 'B', 'C', 'D'],
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
