import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
const { starterJourney } = await import(moduleUrl('supabase/functions/_shared/journeySeeds.ts'));
const { journeyView } = await import(moduleUrl('supabase/functions/_shared/journey.ts'));

export async function testJourneys({ db, rpc, scalar, check, denied }) {
  const owner = randomUUID(), stranger = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, stranger]);
  const plan = starterJourney('Life');
  const saved = await rpc('save_learning_journey', owner, 'Life', plan, 0, null);
  check((await rpc('save_learning_journey', owner, 'Life', plan, 0, null)).id, saved.id);
  check((await rpc('load_all_learning_journeys', owner)).length, 1);
  check(await rpc('load_journey_by_id', stranger, saved.id), null);
  check(await rpc('load_all_learning_journeys', stranger), []);
  check(await rpc('load_learning_journey', stranger, 'Life', saved.id), null);
  const view = row => journeyView({ id: row.id, chapter: row.chapter, plan: row.plan, progress: row.progress });
  check(view(saved).nodes.length, 2);
  assert(!JSON.stringify(view(saved)).includes(plan.nodes.at(-1).title));
  await assert.rejects(rpc('begin_journey_question', owner, saved.id, 'boss', 'mechanism'), /still hidden/);
  await assert.rejects(rpc('begin_journey_question', stranger, saved.id, 'food-fuel', 'intuition'), /not found/);
  await assert.rejects(rpc('save_learning_journey', owner, 'Life', plan, 0, saved.id), /Complete the boss/);
  await db.exec('SET ROLE authenticated');
  await denied('SELECT * FROM public.learning_journeys');
  await denied('SELECT public.load_all_learning_journeys($1)', [owner]);
  await denied('SELECT public.load_journey_by_id($1,$2)', [owner, saved.id]);
  await denied('SELECT public.save_pre_unified_journey($1,$2,$3,0,NULL)', [owner, 'Life', plan]);
  await denied('SELECT public.load_learning_journey($1,$2)', [owner, 'Life']);
  await denied('SELECT public.record_pre_journey_answer($1,$2,0)', [owner, randomUUID()]);
  await db.exec('RESET ROLE');
  let serial = 0;
  const ask = async (node, facet) => {
    const lease = await rpc('begin_journey_question', owner, saved.id, node, facet);
    return rpc('finish_journey_question', owner, lease.lease, lease.generation, saved.id, node, facet, {
      question_text: `Fresh scenario ${++serial}`, options: ['Correct', 'Misconception 1', 'Misconception 2', 'Misconception 3'], correct_index: 0,
      explanation: 'A useful explanation.', knowledge_entry: `${node} ${facet}: earned insight.`, option_feedback: ['Correct reasoning.', 'Check this premise.', 'Check this premise.', 'Check this premise.'],
    });
  };
  await assert.rejects(rpc('begin_journey_question', owner, saved.id, 'food-fuel', 'advanced'), /still hidden/);
  const first = await ask('food-fuel', 'intuition');
  check((await rpc('begin_journey_question', owner, saved.id, 'food-fuel', 'intuition')).active.id, first.id);
  let answer = await rpc('record_question_answer', owner, first.id, 0);
  check(answer.journey.progress['food-fuel'].intuition.successes, 1);
  check(answer.journey.progress['food-fuel'].intuition.entry, 'food-fuel intuition: earned insight.');
  check((await rpc('record_question_answer', owner, first.id, 0)).journey.progress['food-fuel'].intuition.successes, 1);
  await assert.rejects(rpc('record_question_answer', owner, first.id, 1), /different selection/);
  await rpc('collect_learning_reward', owner, first.id);
  const wrong = await ask('food-fuel', 'intuition');
  answer = await rpc('record_question_answer', owner, wrong.id, 1);
  check(answer.journey.progress['food-fuel'].intuition.successes, 1);
  check(answer.journey.progress['food-fuel'].intuition.attempts, 2);
  check(answer.journey.progress['food-fuel'].intuition.entry, 'food-fuel intuition: earned insight.');
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
    if (node === 'food-fuel') { check(view(answer.journey).nodes.some(n => n.id === 'stores'), false); check(view(answer.journey).nodes.some(n => n.id === 'feedback'), false); }
  }
  const missedAdvanced = await ask('food-fuel', 'advanced');
  answer = await rpc('record_question_answer', owner, missedAdvanced.id, 1);
  check(answer.journey.progress['food-fuel'].advanced.successes, 0);
  await rpc('collect_learning_reward', owner, missedAdvanced.id);
  for (let i = 0; i < 3; i++) {
    const q = await ask('food-fuel', 'advanced');
    answer = await rpc('record_question_answer', owner, q.id, 0);
    check(answer.journey.progress['food-fuel'].advanced.successes, i + 1);
    check(answer.reward.calculation.lowValue, false);
    check((await rpc('record_question_answer', owner, q.id, 0)).journey.progress['food-fuel'].advanced.successes, i + 1);
    check(await scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [owner, plan.nodes[0].title]), i === 2 ? 'mastered' : 'proficient');
    await rpc('collect_learning_reward', owner, q.id);
  }
  check(view(answer.journey).nodes.some(n => n.kind === 'boss'), true);
  check((await rpc('kingdom_snapshot', owner)).state.libraryConcepts, 4);
  for (let i = 0; i < 1; i++) {
    const q = await ask('boss', 'mechanism');
    check(q.is_boss_question, true); check(q.required_concepts.length, 2);
    answer = await rpc('record_question_answer', owner, q.id, 0);
    await rpc('collect_learning_reward', owner, q.id);
  }
  check(view(answer.journey).complete, true);
  const next = await rpc('save_learning_journey', owner, 'Life', plan, 0, saved.id);
  check((await rpc('save_learning_journey', owner, 'Life', plan, 0, saved.id)).id, next.id);
  check((await rpc('save_learning_journey', owner, 'Life', plan, 0, null)).id, next.id);
  check((await rpc('load_all_learning_journeys', owner)).length, 2);
  check(next.chapter, 2); check((await rpc('load_learning_journey', owner, 'Life', saved.id)).id, saved.id);
  // A retained entry requires a spaced success; a missed review never deletes it.
  await db.query(`UPDATE public.learning_journeys SET progress=jsonb_set(progress,'{food-fuel,intuition,nextReviewAt}',to_jsonb((now()-interval '2 days')::text)) WHERE id=$1`, [saved.id]);
  const review = await ask('food-fuel', 'intuition');
  answer = await rpc('record_question_answer', owner, review.id, 0);
  check(Boolean(answer.journey.progress['food-fuel'].intuition.retainedAt), true);
  check(answer.journey.progress['food-fuel'].intuition.reviewStep, 1);
  check(new Date(answer.journey.progress['food-fuel'].intuition.nextReviewAt) > new Date(Date.now()+2*86400000), true);
  await rpc('collect_learning_reward', owner, review.id);
  // Retention must recur; a later miss preserves mastery and schedules a short retry.
  await db.query(`UPDATE public.learning_journeys SET progress=jsonb_set(progress,'{food-fuel,intuition,nextReviewAt}',to_jsonb((now()-interval '1 hour')::text)) WHERE id=$1`, [saved.id]);
  const missedReview = await ask('food-fuel', 'intuition');
  answer = await rpc('record_question_answer', owner, missedReview.id, 1);
  check(answer.reward.calculation.due, true);
  check(answer.journey.progress['food-fuel'].intuition.reviewStep, 0);
  check(await scalar('SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name=$2', [owner, plan.nodes[0].title]), 'mastered');
  await rpc('collect_learning_reward', owner, missedReview.id);
  // Deleted history cannot turn an already credited answer into fresh evidence.
  await db.query('DELETE FROM public.questions WHERE id=$1', [review.id]);
  const duplicateLease = await rpc('begin_journey_question', owner, saved.id, 'food-fuel', 'intuition');
  await assert.rejects(rpc('finish_journey_question', owner, duplicateLease.lease, duplicateLease.generation, saved.id, 'food-fuel', 'intuition', {
    question_text: review.question_text, options: ['A', 'B', 'C', 'D'], correct_index: 0, explanation: 'Explanation', knowledge_entry: 'Entry', option_feedback: ['A', 'B', 'C', 'D'],
  }), /already earned/);
  await rpc('cancel_question_generation', owner, duplicateLease.lease);
  const stale = await rpc('begin_journey_question', owner, saved.id, 'cells', 'intuition');
  await rpc('reset_learning_progress', owner, 0);
  check(await rpc('load_learning_journey', owner, 'Life', null), null);
  await assert.rejects(rpc('save_learning_journey', owner, 'Life', plan, 0, null), /reset/);
  await assert.rejects(rpc('finish_journey_question', owner, stale.lease, 0, saved.id, 'cells', 'intuition', {}), /reset/);
  await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [owner, stranger]);
}
