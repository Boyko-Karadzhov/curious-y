import { writeFileSync } from 'node:fs';
import { applyAction, battleSeconds, newKingdom, initialUnitProgress, UNITS } from '../supabase/functions/_shared/kingdom.ts';

// No renderer, randomness, Library or Towers. Run with Node 22.6+.
export function measure(stage, rosterTier, classes, buildingLevel, trainingLevel = 1, keep = Math.max(3, buildingLevel)) {
  let state = newKingdom(); state.castle = keep; state.cleared = stage - 1;
  const ids = classes.map(c => UNITS.find(u => u.unitClass === c && u.tier === rosterTier).id);
  for (const id of ids) {
    const u = UNITS.find(u => u.id === id);
    state.buildings[u.building] = buildingLevel;
    state.units[id] = { ...initialUnitProgress(), level: trainingLevel };
  }
  state.armySlots = [...ids, ...Array(4 - ids.length).fill(null)];
  state = applyAction(state, { type: 'start', stage });
  let peakFighters = 0;
  while (!state.battle.result) {
    state = applyAction(state, { type: 'tick' });
    peakFighters = Math.max(peakFighters, state.battle.fighters.length);
  }
  return { stage, rosterTier, buildingLevel, trainingLevel, keep, units: ids,
    outcome: state.battle.result, seconds: battleSeconds(state.battle, state.battle.elapsed), peakFighters };
}
if (process.argv[1]?.endsWith('measure-roster.mjs')) {
const classes = ['melee','ranged','mounted','siege'];
const results = [
  measure(1,1,['melee'],1,1,1),
  measure(2,1,['melee'],1,1,1),
  measure(2,1,['melee','ranged'],1,1,1),
  measure(5,1,['melee','ranged'],1,1,1),
];
for(let tier=1;tier<=5;tier++) for(let encounter=1;encounter<=10;encounter++) {
  results.push(measure((tier-1)*10+encounter,tier,classes,Math.max(2,tier),3));
}
for(let tier=2;tier<=5;tier++)results.push(measure((tier-1)*10+1,tier-1,classes,tier,1));
writeFileSync('docs/roster-balance.json', JSON.stringify({
  investment:'Rules 7. Listed Keep, building, roster and training levels; one star, no Library/Towers. Four-class campaign uses training 3 and buildings max(2, roster tier). Chapter-transition comparisons use training 1. Seconds are wall time; simulation remains capped at 90 seconds / 18 wall seconds. This is a campaign progression check, not a claim of optimal composition.',
  results,
}, null, 2)+'\n');
console.table(results.map(({units,...r})=>({...r,units:units.join(', ')})));

}
