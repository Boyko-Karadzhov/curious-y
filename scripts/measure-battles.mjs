// Node 22.6+; runs the authoritative simulation, with no renderer or wall clock.
import { applyAction, defaultArmy, newKingdom } from '../supabase/functions/_shared/kingdom.ts';

const examples = [
  ['First battle', 1, 1, [1, 0, 0, 0]],
  ['Infantry and support', 11, 2, [1, 1, 0, 0]],
  ['Four roles', 21, 3, [1, 1, 1, 1]],
  ['Mixed upgrades', 31, 3, [2, 2, 1, 1]],
  ['Late mixed army', 41, 5, [3, 3, 3, 3]],
  ['Underprepared', 81, 1, [1, 0, 0, 0]],
  ['Unsupported infantry', 41, 5, [5, 0, 0, 0]],
  ['Overprepared', 1, 5, [5, 5, 5, 5]],
];
for (const [name, stage, castle, levels] of examples) {
  let state = newKingdom();
  state.castle = castle;
  state.cleared = stage - 1;
  state.buildings = Object.fromEntries(['barracks', 'range', 'stable', 'workshop'].map((id, i) => [id, levels[i]]));
  state.armySlots = defaultArmy(state);
  state = applyAction(state, { type: 'start', stage });
  while (!state.battle.result) state = applyAction(state, { type: 'tick' });
  console.log(JSON.stringify({ name, stage, castle, levels, seconds: state.battle.elapsed, outcome: state.battle.result }));
}
