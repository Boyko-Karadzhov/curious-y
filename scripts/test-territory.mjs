import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { game as g } from './load-game.mjs';

export async function testTerritory({ db, rpc, check }) {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  const state = g.newKingdom();
  state.cleared = 3;
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1', [user, state]);
  const lease = await rpc('begin_question_generation', user, 'Life');
  const q = await rpc('finish_question_generation', user, lease.lease, lease.generation, {
    topic: 'Life', question_text: 'Why does a cell need energy?', options: ['Metabolism', 'No reason', 'Color', 'Gravity'],
    correct_index: 0, explanation: 'Metabolism uses energy.', concept: `Energy ${randomUUID()}`,
    concept_definition: 'Energy for cellular work', reasoning_complexity: 'directInference',
    is_boss_question: false, required_concepts: [], suggested_questions: [], topic_weights: { Life: 1 },
  });
  const answered = await rpc('record_question_answer', user, q.id, 0);
  check(answered.kingdom.state.gold, 0);
  await rpc('collect_learning_reward', user, q.id);
  const context = await rpc('kingdom_command_context', user, 0);
  const command = { type: 'collect-production' };
  const now = new Date().toISOString();
  const next = g.applyAction(context.state, command, { now });
  const collected = await rpc('commit_kingdom_command', user, 0, context.revision, randomUUID(), command, next, null);
  check(collected.state.gold, 130);
  check(collected.state.lifetimeGold, 130);
  const fake = { ...collected.state, tribute: { ...collected.state.tribute, paid: 9999 } };
  await assert.rejects(rpc('commit_kingdom_command', user, 0, collected.revision, randomUUID(), { type: 'army', slots: fake.armySlots }, fake, null), /Invalid/);
  for (const role of ['anon', 'authenticated']) {
    const signature = 'public.apply_territory_tribute(jsonb,timestamptz,bigint,boolean)';
    check((await db.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, signature])).rows[0].allowed, false);
  }
  await rpc('reset_learning_progress', user, 0);
  check((await rpc('kingdom_snapshot', user)).state, g.newKingdom());
  await db.query('DELETE FROM auth.users WHERE id=$1', [user]);
}
