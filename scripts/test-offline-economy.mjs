import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { game } from './load-game.mjs';

async function prepare(db) {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  let state = game.newKingdom();
  state.castle = 2;
  for (const topic of ['Life', 'Chemistry', 'Society & History']) state.tokens[topic] = 100;
  for (const id of ['farm', 'smelter', 'market']) {
    state = game.applyAction(state, { type: 'building', id }, { now: '2026-09-20T12:00:00Z' });
  }
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1', [user, state]);
  return user;
}

async function commit(rpc, user, command) {
  const context = await rpc('kingdom_command_context', user, 0);
  const state = game.applyAction(context.state, command, { now: new Date().toISOString() });
  return rpc('commit_kingdom_command', user, 0, context.revision, randomUUID(), command, state, null);
}

export async function testOfflineEconomy({ db, rpc, check }) {
  const user = await prepare(db);
  const collected = await commit(rpc, user, { type: 'collect-production' });
  check([collected.state.gold, collected.state.food, collected.state.metal], [100, 24, 1464]);
  check(collected.state.tribute.paid, 100);
  const traded = await commit(rpc, user, { type: 'trade', from: 'gold', to: 'food', amount: 2 });
  check([traded.state.gold, traded.state.food], [80, 26]);
  const knowledge = await commit(rpc, user, { type: 'trade', from: 'Life', to: 'Chemistry', amount: 2 });
  check([knowledge.state.tokens.Life, knowledge.state.tokens.Chemistry], [91, 97]);
  assert.throws(() => game.applyAction(knowledge.state, { type: 'trade', from: 'gold', to: 'Life', amount: 1 }), /Invalid Market trade/);
  check(await rpc('valid_economy_state', knowledge.state), true);
  await db.query('DELETE FROM auth.users WHERE id=$1', [user]);
}
