import { describe,it,expect,beforeEach } from 'vitest';
import { applyAction,newKingdom,BUILDINGS,TOPICS,RECRUITMENT,recruitmentOdds,rollRecruit,recruitmentLevel,innateXP,recruitLevel,xpProgress,xpThreshold,mergeClass,unitDefinition,UNITS,unitStats,initialUnitProgress,effectiveOwnedUnit,parseKingdom,type Kingdom,type Action } from '../lib/kingdom/game';
import { parseKingdomCommand,executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { changeKingdom,loadKingdom,resetKingdom,demoGeneration } from '../lib/kingdom/storage';
const rich = () => {const s=newKingdom();s.castle=5;for(const t of TOPICS)s.tokens[t]=20000;return s;};
const pack = (s:Kingdom,n:number,draws=[.5,.5,.5]) => applyAction(s,{type:'recruit',id:'barracks'},{requestId:`pack-${n}`,draws});
const total = (s:Kingdom) => Object.values(s.units).reduce((n,r)=>n+innateXP(r.unitId)+r.investedXP,0);
describe('Recruitment economy and probabilities',()=>{
  it('constructs every building with no recruits and preserves gates and prices',()=>{
    for(const b of BUILDINGS){const s=rich();const next=applyAction(s,{type:'building',id:b.id});expect(next.units).toEqual({});expect(next.buildings[b.id]).toBe(1);expect(next.tokens[RECRUITMENT.topics[b.id] as keyof typeof s.tokens]).toBe(20000-b.cost/2);if(b.unlock>1)expect(()=>applyAction({...s,castle:b.unlock-1},{type:'building',id:b.id})).toThrow(/Keep/);expect(()=>applyAction(next,{type:'building',id:b.id})).toThrow(/earned/);}
    const s=newKingdom();s.tokens.Physics=25;const next=pack(applyAction(s,{type:'building',id:'barracks'}),1);expect(next.tokens.Physics).toBe(0);expect(Object.values(next.units)).toEqual([{unitId:'militia',investedXP:20,locked:false}]);
  });
  it('charges each correct primary resource, rejects insufficient funds and untrusted outcomes',()=>{
    for(const b of BUILDINGS){let s=applyAction(rich(),{type:'building',id:b.id});const before={...s.tokens};s=applyAction(s,{type:'recruit',id:b.id},{requestId:b.id,draws:[0,.5,.999]});expect(Object.keys(s.units)).toHaveLength(1);for(const t of TOPICS)expect(s.tokens[t]).toBe(before[t]-(t===RECRUITMENT.topics[b.id]?15:0));expect(s.gold).toBe(0);}
    const s=rich();s.buildings.barracks=1;s.tokens.Physics=14;expect(()=>pack(s,1)).toThrow(/Force/);expect(s.units).toEqual({});expect(()=>applyAction(rich(),{type:'recruit',id:'barracks'})).toThrow();
    expect(parseKingdomCommand({type:'recruit',id:'barracks',draws:[0,0,0],cost:0})).toEqual({type:'recruit',id:'barracks'});
    for(const type of ['unit-unlock','unit-level','unit-star']){expect(()=>parseKingdomCommand({type,id:'militia',expected:1})).toThrow();expect(()=>applyAction(s,{type,id:'militia'} as unknown as Action)).toThrow();}
  });
  it('uses pre-action levels, independent rolls, ten-action boundaries and a Keep-independent cap',()=>{
    let s=rich();s.castle=1;s.buildings.barracks=1;
    for(let n=1;n<=10;n++)s=pack(s,n,[0,0,0]);
    expect(s.buildings.barracks).toBe(2);expect(new Set(Object.values(s.units).map(r=>r.unitId))).toEqual(new Set(['militia']));
    s=pack(s,11,[0,.01,.999]);expect(s.lastResult!.recruits.map(r=>r.unitId)).toEqual(['champion','spearman','militia']);
    s.recruitCount.barracks=989;s.buildings.barracks=99;s=pack(s,990);expect(s.buildings.barracks).toBe(100);expect(s.lastResult).toMatchObject({previousLevel:99});s=pack(s,991);expect(s.lastResult).toMatchObject({previousLevel:100,level:100});expect(recruitmentLevel(10000)).toBe(100);
  });
  it('normalizes every row and preserves monotone upper tails and reference percentages',()=>{
    let prior=[0,0,0,0,0];for(let level=1;level<=100;level++){const row=recruitmentOdds(level);expect(row.every(p=>p>=0)).toBe(true);expect(row.reduce((a,b)=>a+b,0)).toBeCloseTo(1,12);for(let tier=1;tier<5;tier++)expect(row.slice(tier).reduce((a,b)=>a+b,0)+1e-14).toBeGreaterThanOrEqual(prior.slice(tier).reduce((a,b)=>a+b,0));prior=row;}
    expect(recruitmentOdds(2)[0]).toBeCloseTo(.98,6);expect(recruitmentOdds(50)[2]).toBeCloseTo(.73348,5);expect(recruitmentOdds(100)[4]).toBeCloseTo(.95221,5);
    const row=recruitmentOdds(50);let sum=0;for(let tier=5;tier>=1;tier--){expect(unitDefinition(rollRecruit('barracks',50,sum+row[tier-1]/2)).tier).toBe(tier);sum+=row[tier-1];}
  });
  it('reproduces discovery percentiles analytically without guarantees',()=>{
    const result=[];for(let tier=2;tier<=5;tier++){let survival=1;const hits:number[]=[];for(let n=1;n<=1000;n++){const p=recruitmentOdds(recruitmentLevel(n-1)).slice(tier-1).reduce((a,b)=>a+b,0);survival*=(1-p)**3;for(const [i,q] of [.1,.5,.9].entries())if(hits[i]===undefined&&1-survival>=q)hits[i]=n;}result.push(hits);}
    expect(result).toEqual([[12,21,37],[108,155,189],[314,375,414],[526,578,615]]);
  });
});
describe('Automatic class merging and immutable battles',()=>{
  it('merges every pack immediately and conserves all XP',()=>{
    let s=rich();s.buildings.barracks=1;s=pack(s,1);
    expect(Object.keys(s.units)).toEqual(['pack-1-0']);expect(xpProgress(s.units['pack-1-0'])).toEqual({level:2,current:0,required:30});
    s=pack(s,2);expect(Object.keys(s.units)).toEqual(['pack-1-0']);expect(recruitLevel(s.units['pack-1-0'])).toBe(3);expect(total(s)).toBe(60);
    expect(s.lastResult!.merge).toMatchObject({gainedXP:30,beforeLevel:2,level:3});
  });
  it('promotes to the highest drawn tier and transfers an equipped veteran automatically',()=>{
    let s=rich();s.buildings.barracks=2;s.recruitCount.barracks=10;
    s.units={veteran:{unitId:'militia',investedXP:540,locked:true}};s.armySlots[2]='veteran';
    s=pack(s,11,[.01,.999,.999]);expect(Object.keys(s.units)).toEqual(['pack-11-0']);
    expect(s.units['pack-11-0']).toEqual({unitId:'spearman',investedXP:570,locked:false});expect(s.armySlots[2]).toBe('pack-11-0');
    expect(total(s)).toBe(600);expect(s.discovered).toEqual(['spearman','militia']);
    s=pack(s,12);expect(s.units['pack-11-0'].unitId).toBe('spearman');expect(s.units['pack-11-0'].investedXP).toBe(600);
  });
  it('keeps the five classes independent and rejects obsolete manual commands',()=>{
    let s=rich();for(const b of BUILDINGS){s.buildings[b.id]=1;for(let n=0;n<3;n++)s=applyAction(s,{type:'recruit',id:b.id},{requestId:b.id+'-'+n,draws:[.5,.5,.5]});}
    expect(Object.keys(s.units)).toHaveLength(5);expect(new Set(Object.values(s.units).map(r=>unitDefinition(r.unitId).unitClass)).size).toBe(5);expect(total(s)).toBe(450);
    for(const type of ['merge','lock']){expect(()=>parseKingdomCommand({type})).toThrow();expect(()=>applyAction(s,{type} as Action)).toThrow();}
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    s.units.duplicate={...Object.values(s.units)[0]};expect(()=>parseKingdom(JSON.stringify(s))).toThrow();
  });
  it('converts old collections once, preserving XP, discoveries, slots and buildings',()=>{
    const s=rich();s.buildings.barracks=1;s.discovered=['militia','spearman'];s.units={a:{unitId:'militia',investedXP:540,locked:true},b:{unitId:'spearman',investedXP:30,locked:false},c:{unitId:'militia',investedXP:10,locked:false}};s.armySlots=['a','b',null,null,null];
    const converted=parseKingdom(JSON.stringify({...s,version:8}));expect(converted.version).toBe(10);expect(Object.keys(converted.units)).toEqual(['b']);expect(total(converted)).toBe(total(s));expect(converted.armySlots).toEqual(['b',null,null,null,null]);expect(converted.discovered).toEqual(s.discovered);expect(converted.buildings).toEqual(s.buildings);expect(parseKingdom(JSON.stringify(converted))).toEqual(converted);
  });
  it('derives uncapped levels with exact safe-integer boundaries and rejects overflow',()=>{
    for(const u of UNITS)for(const level of [1,2,3,10,20,1000,100000]){const xp=xpThreshold(level,u.id);expect(recruitLevel({unitId:u.id,investedXP:xp,locked:false})).toBe(level);if(level>1)expect(recruitLevel({unitId:u.id,investedXP:xp-1,locked:false})).toBe(level-1);}
    for(const u of UNITS){const r={unitId:u.id,investedXP:Number.MAX_SAFE_INTEGER-innateXP(u.id),locked:false};expect(recruitLevel(r)).toBeGreaterThan(100000);expect(xpProgress(r).current).toBeLessThan(xpProgress(r).required);}
    const s=rich();s.units={a:{unitId:'militia',investedXP:Number.MAX_SAFE_INTEGER-10,locked:false},b:{unitId:'militia',investedXP:0,locked:false}};expect(()=>mergeClass(s,'barracks')).toThrow(/safe/);s.buildings.barracks=1;delete s.units.b;const before=structuredClone(s);expect(()=>pack(s,1)).toThrow(/safe/);expect(s).toEqual(before);
  });
  it('improves effective power when investment moves up a tier at boundaries and large XP',()=>{
    for(const donor of UNITS.filter(u=>u.tier<5)){
      const recipient=UNITS.find(u=>u.building===donor.building&&u.tier===donor.tier+1)!;
      for(const level of [1,2,10,20,1000,100000])for(const offset of [-1,0,1]){
        const xp=xpThreshold(level,donor.id)+offset;if(xp<0)continue;
        const s=rich();s.units={a:{unitId:donor.id,investedXP:xp,locked:false},b:{unitId:recipient.id,investedXP:0,locked:false}};
        const before=effectiveOwnedUnit(s,'a');mergeClass(s,donor.building);const after=effectiveOwnedUnit(s,'b');
        expect(after.hp).toBeGreaterThan(before.hp);
        if(donor.unitClass==='healer')expect(after.healBudget).toBeGreaterThan(before.healBudget!);else expect(after.damage).toBeGreaterThan(before.damage);
      }
    }
  });
  it('freezes active battle stats while merging and recruiting; scales healer output exactly once',()=>{
    let s=rich();s.buildings.barracks=1;s=pack(s,1);s.armySlots[0]='pack-1-0';s=applyAction(s,{type:'start',stage:1});const snapshot=structuredClone(s.battle!.config);s=pack(s,2);expect(s.battle!.config).toEqual(snapshot);s=applyAction(s,{type:'retreat'});s=applyAction(s,{type:'start',stage:1});expect(s.battle!.config.slots[0]!.hp).toBe(91);
    for(const u of UNITS){const a=unitStats(u.id,1,10,undefined,{...initialUnitProgress(),level:10}),b=unitStats(u.id,100,10,undefined,{...initialUnitProgress(),level:10});expect(a).toEqual(b);expect(a.hp).toBe(Math.round(u.hp*2.8));if(u.unitClass==='healer'){expect(a.damage).toBe(0);expect(a.healPerSecond).toBeCloseTo(3*3**(u.tier-1)*2.8);expect(a.healBudget).toBeCloseTo(24*3**(u.tier-1)*2.8);}}
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
  });
  it('resets legacy military state while preserving learning, wallets and independent buildings',()=>{const s=rich();s.buildings.barracks=5;s.cleared=40;const reset=parseKingdom(JSON.stringify({...s,version:7}));expect(reset.units).toEqual({});expect(reset.buildings.barracks).toBe(0);expect(reset.cleared).toBe(0);expect(reset.tokens).toEqual(s.tokens);expect(reset.castle).toBe(5);});
});
describe('Demo committed command recovery',()=>{
  beforeEach(()=>localStorage.clear());
  it('deduplicates recruitment and its merge across reload, isolates users and rejects reset generations',async()=>{
    const s=rich();s.buildings.barracks=1;localStorage.setItem('curious_y_phase1_v1_demo',JSON.stringify(s));
    const epoch=demoGeneration('demo'), action={type:'recruit' as const,id:'barracks' as const};const a=await changeKingdom('demo',action,'same',epoch);const b=await changeKingdom('demo',action,'same',epoch);expect(b.units).toEqual(a.units);expect(b.tokens).toEqual(a.tokens);expect(loadKingdom('other').units).toEqual({});
    expect(Object.keys(b.units)).toHaveLength(1);expect(b.units['same-0'].investedXP).toBe(20);expect(b.lastResult).toEqual(a.lastResult);resetKingdom('demo');await expect(changeKingdom('demo',action,'same',epoch)).rejects.toThrow(/reset/);
  });
  it('uses injected reservation inputs in the authoritative executor',()=>{const s=rich();s.buildings.barracks=1;const context={state:s,revision:0,generation:0,battle_clock:null,server_now:'2026-09-06T00:00:00Z'};const entropy={requestId:'reserved',draws:[.1,.2,.3]};expect(executeKingdomCommand(context,{type:'recruit',id:'barracks'},entropy)).toEqual(executeKingdomCommand(context,{type:'recruit',id:'barracks'},entropy));});
});
