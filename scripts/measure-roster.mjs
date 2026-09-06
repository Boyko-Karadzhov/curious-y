import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { applyAction, newKingdom, reconcileUnits, initialUnitProgress, UNITS, unitStats } from '../supabase/functions/_shared/kingdom.ts';
const builds = {
  balanced: ['swordsman','archer','knight','catapult'],
  pikes: ['spearman','crossbowman','medic','catapult'],
  swarm: ['swordsman','slinger','scout-rider','archer'],
  artillery: ['shieldbearer','clockwork-gunner','bombardier','medic'],
  colossusMixed: ['spearman','archer','astral-colossus','catapult'],
  astral: ['astral-colossus','battle-sage','frost-mage','shieldbearer'],
};
const foes = { swarm:['slinger','swordsman','scout-rider'], armored:['shieldbearer','knight','ram'], ranged:['ranger','archer','clockwork-gunner'], cavalry:['knight','lancer','scout-rider'], siege:['catapult','ram','bombardier'], support:['swordsman','medic','battle-sage'] };
const results=[];
for(const [name,slots] of Object.entries(builds)) for(const [enemy,ids] of Object.entries(foes)) {
  let s=newKingdom();s.castle=3;s.cleared=20;
  for(const u of UNITS) {s.buildings[u.building]=3;s.units[u.id]={...initialUnitProgress(),level:2};}
  s=reconcileUnits(s);s.armySlots=slots;s=applyAction(s,{type:'start',stage:21});
  s.battle.config.enemy.units=ids.map(id=>unitStats(id,3));s.battle.config.enemy.spawnInterval=8;
  let peak=0;const start=performance.now();
  while(!s.battle.result){s=applyAction(s,{type:'tick'});peak=Math.max(peak,s.battle.fighters.length);}
  results.push({build:name,enemy,seconds:s.battle.elapsed,result:s.battle.result,enemyHp:Math.round(s.battle.enemyHp),playerHp:Math.round(s.battle.playerHp),peakFighters:peak,simulationMs:Number((performance.now()-start).toFixed(1))});
}
console.table(results);writeFileSync('docs/roster-balance.json',JSON.stringify({investment:'Keep 3; all recruitment buildings 3; each of four equipped units level 2/star 1; no towers/Library. Unit upgrade investment 0 Gold + 35 total Resources, with topic distributions varying by build. Stage 21 Keep HP; enemy building stats 3, one recruit every 8 simulation seconds. Reported seconds use simulation time; divide by 5 for rules-6 wall time.',results},null,2)+'\n');
