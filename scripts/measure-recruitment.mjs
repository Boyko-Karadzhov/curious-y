import {writeFileSync} from 'node:fs';
import {game as g} from './load-game.mjs';
const discovery=[];
for(let tier=2;tier<=5;tier++) {
  let survival=1;const percentiles=[];
  for(let n=1;n<=1000;n++) {
    const p=g.recruitmentOdds(g.recruitmentLevel(n-1)).slice(tier-1).reduce((a,b)=>a+b,0);
    survival*=(1-p)**3;
    for(const [i,q] of [.1,.5,.9].entries())if(percentiles[i]===undefined&&1-survival>=q)percentiles[i]=n;
  }
  discovery.push({tier,actions:percentiles,medianCostPerResource:percentiles[1]*g.RECRUITMENT.cost});
}
function draw(index) { let n=index+1,value=0,place=.5;while(n){value+=(n%2)*place;n=Math.floor(n/2);place/=2;}return value; }
function roster(actions,buildings,unlucky=false) {
  let s=g.newKingdom();s.castle=buildings.length>1?3:1;
  for(const t of g.TOPICS)s.tokens[t]=100000;
  s=g.applyAction(s,{type:'building',id:'barracks'});
  // One Hall, with an explicit simulated strategy: merge each class into its
  // highest-tier copy, then equip either one melee slot or five class slots.
  for(let n=1;n<=actions;n++) {
    s=g.applyAction(s,{type:'recruit',id:'barracks'},{requestId:`pack-${n}`,draws:[0,1,2,3,4,5].map(i=>unlucky && i<3 ? .999999 : draw((n-1)*6+i))});
    for(const family of ['melee','ranged','swarm','healer','siege']) {
      const copies=Object.entries(s.units).filter(([,r])=>g.unitDefinition(r.unitId).unitClass===family).sort((a,b)=>g.unitDefinition(b[1].unitId).tier-g.unitDefinition(a[1].unitId).tier);
      if(copies.length>1)s=g.applyAction(s,{type:'merge',recipient:copies[0][0],donors:copies.slice(1).map(([id])=>id)});
    }
  }
  const ids=Object.keys(s.units).filter(id=>buildings.length>1||g.unitDefinition(s.units[id].unitId).unitClass==='melee');
  return g.applyAction(s,{type:'army',slots:[...ids,...Array(5-ids.length).fill(null)]});
}
function fight(state,stage) {
  let s=g.applyAction({...state,cleared:stage-1},{type:'start',stage});let peak=0;
  while(!s.battle.result){s=g.applyAction(s,{type:'tick'});peak=Math.max(peak,s.battle.fighters.length);}
  return {stage,outcome:s.battle.result,seconds:g.battleSeconds(s.battle,s.battle.elapsed),peakFighters:peak};
}
const trajectories=[],battles=[];
for(const actions of [1,5,10,21,37,155,375,578,990])for(const unlucky of [false,true]) {
  const s=roster(actions,['melee'],unlucky),r=s.units[s.armySlots[0]];
  trajectories.push({actions,path:unlucky?'adverse quantile 0.999999':'fixed low-discrepancy draws',type:r.unitId,tier:g.unitDefinition(r.unitId).tier,level:g.recruitLevel(r),investedXP:r.investedXP,hp:g.effectiveOwnedUnit(s,s.armySlots[0]).hp});
  for(const stage of actions<=10?[1,2,5,10]:actions<100?[10,11,20]:actions<400?[20,21,30,31]:[31,40,41,50])battles.push({packs:actions,classes:['melee'],unlucky,...fight(s,stage)});
}
for(const actions of [1,10,37,155,375,578])for(const unlucky of [false,true]) {
  const buildings=['melee','ranged','swarm','healer','siege'];const s=roster(actions,buildings,unlucky);
  for(const stage of [1,10,11,20,21,30,31,40,41,50])battles.push({packs:actions,classes:buildings,unlucky,roster:Object.values(s.units).map(r=>`${r.unitId} L${g.recruitLevel(r)}`),...fight(s,stage)});
}
const report={rules:g.CURRENT_RULES,tuning:g.RECRUITMENT.version,assumptions:'No Tower/Library modifiers. One slot per family. Simulated player deliberately merges each class into its highest tier. One Hall; single-class build Keep 1, five-class build Keep 3. Construction/Keep costs excluded from recruitment spend. Fixed low-discrepancy and adverse quantile paths are reproducible examples, not discovery guarantees or estimated win probabilities.',discovery,trajectories,battles};
writeFileSync('docs/recruitment-balance.json',JSON.stringify(report,null,2)+'\n');
console.table(discovery);console.table(trajectories);console.log(`${battles.length} deterministic battles measured.`);
