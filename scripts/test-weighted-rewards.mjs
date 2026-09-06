import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const weights = { Physics: .7, 'Mathematics & Logic': .2, 'Earth & Space': .1 };
const question = { topic: 'Physics', question_text: 'Why does force accelerate matter?', options: ['A','B','C','D'],
  correct_index: 0, explanation: 'A is correct.', suggested_questions: [], concept: 'shared force', concept_definition: 'Force',
  reasoning_complexity: 'directInference', is_boss_question: false, required_concepts: [], topic_weights: weights };
const lines = [{ key: 'force', amount: 7 }, { key: 'runes', amount: 2 }, { key: 'astral', amount: 1 }];
const issue = async (rpc, user, changes = {}) => {
  const lease = await rpc('begin_question_generation', user, 'Physics');
  return rpc('finish_question_generation', user, lease.lease, lease.generation, { ...question, ...changes });
};
export async function testWeightedRewards({ db, rpc, check, scalar }) {
  check(await rpc('allocate_resources', 20, weights, 'Physics'), lines.map(line => ({ ...line, amount: line.amount * 2 })));
  check(await rpc('normalize_topic_weights', { Physics: 7, Life: 3, Chemistry: -1, Other: 88 }, 'Physics'), { Physics: .7, Life: .3 });
  check(await rpc('normalize_topic_weights', { Physics: 1e308, Life: 1e308 }, 'Physics'), { Physics: .5, Life: .5 });
  for (const malformed of [null, [], '"Physics"', { Physics: 'Infinity', Life: '2', Chemistry: 0, Other: 1 }]) {
    check(await rpc('allocate_resources', 3, malformed, 'Life'), [{ key: 'essence', amount: 3 }]);
  }
  const all = { 'Society & History': 1, Life: 1, Physics: 1, Chemistry: 1, 'Computer Science': 1,
    'Mathematics & Logic': 1, 'Earth & Space': 1, 'Mind & Behavior': 1 };
  for (let total = 0; total < 33; total++) {
    for (const distribution of [weights, all]) {
      const allocated = await rpc('allocate_resources', total, distribution, 'Physics');
      check(allocated.reduce((sum, line) => sum + line.amount, 0), total);
      check(allocated.every(line => Number.isInteger(line.amount) && line.amount > 0), true);
    }
  }
  check(await rpc('allocate_resources', 3, all, 'Physics'), [{ key: 'force', amount: 1 }, { key: 'runes', amount: 1 }, { key: 'reagents', amount: 1 }]);
  await assert.rejects(rpc('allocate_resources', -1, weights, 'Physics'), /Invalid/);
  const user = randomUUID(), other = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [user, other]);
  await db.query(`INSERT INTO public.concepts(user_id,canonical_name,definition,aliases,topics)
    VALUES($1,'Canonical force','Force','["shared force"]',$2)`, [user, weights]);
  const issued = await issue(rpc, user, { concept: '  SHARED   force ', topic_weights: { Life: 1 } });
  check(issued.concept, 'Canonical force'); check(issued.topic_weights, weights);
  await assert.rejects(db.query(`UPDATE public.questions SET topic_weights='{"Life":1}' WHERE id=$1`, [issued.id]), /immutable/);
  await db.query(`UPDATE public.concepts SET topics='{"Life":1}' WHERE user_id=$1`, [user]);
  const answered = await rpc('record_question_answer', user, issued.id, 0);
  check(answered.reward.lines, lines); check(answered.reward.topicWeights, weights); check(answered.kingdom.state.tokens.Physics, 0);
  check(answered.reward.gold, undefined); check(answered.reward.keys, undefined);
  check(answered.stats.gold, 0); check(answered.stats.keys, 0); check(answered.stats.knowledge.force, 0);
  check(answered.stats.answers_today, 1);
  check(await scalar('SELECT topics FROM public.concepts WHERE user_id=$1', [user]), { Life: 1 });
  check(await scalar("SELECT reasoning_track->'directInference' FROM public.concepts WHERE user_id=$1", [user]), 1);
  check((await rpc('record_question_answer', user, issued.id, 0)).reward, answered.reward);
  await assert.rejects(rpc('record_question_answer', user, issued.id, 1), /different selection/);
  check((await rpc('pending_learning_reward', user)).reward, answered.reward);
  await assert.rejects(rpc('record_question_answer', other, issued.id, 0), /not found/);
  await assert.rejects(rpc('collect_learning_reward', other, issued.id), /not found/);
  await assert.rejects(db.query("UPDATE public.learning_reward_events SET reward='{}' WHERE user_id=$1", [user]), /immutable/);
  const collected = await rpc('collect_learning_reward', user, issued.id);
  check(collected.reward, answered.reward);
  check(collected.state.tokens.Physics, 7); check(collected.state.tokens['Mathematics & Logic'], 2); check(collected.state.tokens['Earth & Space'], 1);
  check((await rpc('collect_learning_reward', user, issued.id)).revision, collected.revision);
  await assert.rejects(db.query('UPDATE public.learning_reward_events SET collected_at=NULL WHERE user_id=$1', [user]), /immutable/);
  check(await rpc('pending_learning_reward', user), null);
  await rpc('reset_learning_progress', user, 0);
  await assert.rejects(rpc('collect_learning_reward', user, issued.id), /reset/);
  // New concepts persist the normalized issuance distribution, not a single question topic.
  const fresh = await issue(rpc, user, { topic_weights: { Physics: 7, 'Mathematics & Logic': 2, 'Earth & Space': 1 } });
  const incorrect = await rpc('record_question_answer', user, fresh.id, 1);
  check(incorrect.reward.lines, [{ key: 'force', amount: 2 }, { key: 'runes', amount: 1 }]);
  check(await scalar('SELECT topics FROM public.concepts WHERE user_id=$1', [user]), weights);
  await rpc('collect_learning_reward', user, fresh.id);
  // Valid interdisciplinary weights cannot relax selected-topic or prerequisite gates.
  const lease = await rpc('begin_question_generation', user, 'Physics');
  await assert.rejects(rpc('finish_question_generation', user, lease.lease, 1, { ...question, concept: 'new', topic_weights: { Life: 1 } }), /selected topic/);
  await assert.rejects(rpc('finish_question_generation', user, lease.lease, 1, { ...question, concept: 'new', required_concepts: ['Unknown'] }), /prerequisites/);
  await assert.rejects(rpc('finish_question_generation', user, lease.lease, 1, { ...question, topic: 'Life' }), /selected topic/);
  const fallback = await rpc('finish_question_generation', user, lease.lease, 1, { ...question, concept: 'new', topic_weights: { Physics: '2', Other: 99 } });
  check(fallback.topic_weights, { Physics: 1 });
  await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [user, other]);
}

export async function testWeightedRaces({ db, pool, rpc, check }) {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [user]);
  const issued = await issue(rpc, user);
  const answers = await Promise.all(Array.from({ length: 4 }, () => pool.query('SELECT public.record_question_answer($1,$2,0) result', [user, issued.id])));
  for (const result of answers) check(result.rows[0].result.reward.lines, lines);
  const collections = await Promise.all(Array.from({ length: 4 }, () => pool.query('SELECT public.collect_learning_reward($1,$2) result', [user, issued.id])));
  for (const result of collections) {
    check(result.rows[0].result.reward, answers[0].rows[0].result.reward);
    check(result.rows[0].result.state.tokens.Physics, 7);
    check(result.rows[0].result.state.tokens['Mathematics & Logic'], 2);
    check(result.rows[0].result.revision, 1);
  }
  // Force both serialization orders using a separate session holding the account lock.
  for (const first of ['reset', 'collect']) {
    const q = await issue(rpc, user, { concept: `race ${first}` });
    await rpc('record_question_answer', user, q.id, 0);
    const generation = (await rpc('kingdom_snapshot', user)).generation;
    const lock = await pool.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT 1 FROM public.kingdom_state WHERE user_id=$1 FOR UPDATE', [user]);
      const blocked = (first === 'reset'
        ? pool.query('SELECT public.collect_learning_reward($1,$2)', [user, q.id])
        : pool.query('SELECT public.reset_learning_progress($1,$2)', [user, generation])).then(value => ({ value }), error => ({ error }));
      if (first === 'reset') await lock.query('SELECT public.reset_learning_progress($1,$2)', [user, generation]);
      else await lock.query('SELECT public.collect_learning_reward($1,$2)', [user, q.id]);
      await lock.query('COMMIT');
      const result = await blocked;
      if (first === 'reset') check(result.error?.message.includes('reset'), true);
      else check(result.error, undefined);
      const final = await rpc('kingdom_snapshot', user);
      check(final.generation, generation + 1);
      check(Object.values(final.state.tokens).reduce((sum, value) => sum + value, 0), 0);
      await assert.rejects(rpc('collect_learning_reward', user, q.id), /reset/);
    } finally { await lock.query('ROLLBACK'); lock.release(); }
  }
  await db.query('DELETE FROM auth.users WHERE id=$1', [user]);
}
