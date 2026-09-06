// Node 22.6+; authoritative combat, without renderer or wall-clock waits.
import { applyAction, battleSeconds, newKingdom, reconcileUnits, stageLabel, UNITS } from '../supabase/functions/_shared/kingdom.ts';

const examples = [
  ['First Barracks', 1, 1, 1, 1, ['swordsman']],
  ['Same army at 1-2', 2, 1, 1, 1, ['swordsman']],
  ['Add Archery Range', 2, 1, 1, 1, ['swordsman', 'archer']],
  ['Early army needs upgrades', 4, 1, 1, 1, ['swordsman', 'archer']],
  ['Chapter-one mixed army', 10, 2, 2, 1, ['swordsman', 'archer', 'knight', 'medic']],
  ['Chapter transition', 11, 2, 2, 1, ['swordsman', 'archer', 'knight', 'medic']],
  ['Upgraded with siege', 11, 3, 3, 2, ['swordsman', 'archer', 'knight', 'catapult']],
  ['Underprepared late army', 41, 5, 3, 1, ['swordsman', 'archer', 'knight', 'catapult']],
];
for (const [name, stage, castle, buildingLevel, unitLevel, slots] of examples) {
  let state = newKingdom(); state.castle = castle; state.cleared = stage - 1;
  for (const id of slots) state.buildings[UNITS.find(u => u.id === id).building] = buildingLevel;
  state = reconcileUnits(state);
  for (const id of slots) state.units[id].level = unitLevel;
  state.armySlots = [...slots, ...Array(4 - slots.length).fill(null)];
  state = applyAction(state, { type: 'start', stage });
  while (!state.battle.result) state = applyAction(state, { type: 'tick' });
  console.log(JSON.stringify({ name, stage: stageLabel(stage), castle, buildingLevel, unitLevel, slots,
    seconds: battleSeconds(state.battle, state.battle.elapsed), outcome: state.battle.result }));
}
