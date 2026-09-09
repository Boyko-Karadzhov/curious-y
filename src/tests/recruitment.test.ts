import { describe,it,expect,beforeEach } from 'vitest';
import { applyAction,newKingdom,TOPICS,recruitmentOdds,rollRecruit,recruitmentLevel,innateXP,recruitLevel,xpProgress,xpThreshold,unitDefinition,UNITS,parseKingdom,type Kingdom } from '../lib/kingdom/game';
import { parseKingdomCommand,executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { changeKingdom,loadKingdom,resetKingdom,demoGeneration } from '../lib/kingdom/storage';
const rich=()=>{
    const s=newKingdom();s.castle=5;for(const t of TOPICS){
        s.tokens[t]=20000;
    }

    return s;
};

const pack=(s:Kingdom,n:number,draws=[.5,.5,.5,0,0,0])=>applyAction(s,{type:'recruit',id:'barracks'},{requestId:`pack-${n}`,draws});
const total=(s:Kingdom)=>Object.values(s.units).reduce((n,r)=>n+innateXP(r.unitId)+r.investedXP,0);
describe('Unified recruitment and independent copies',()=>{
    it('builds one Hall, charges Earth and Life, keeps three copies and guarantees an attacking start',()=>{
        const s=rich();const built=applyAction(s,{type:'building',id:'barracks'});expect(built.units).toEqual({});
        const next=pack(built,1);expect(Object.values(next.units).map(r=>r.unitId)).toEqual(['militia','slinger','hatchling']);
        expect(next.tokens.Life).toBe(19987);expect(next.tokens['Earth & Space']).toBe(19987);expect(next.tokens.Physics).toBe(20000);
        expect(()=>applyAction(next,{type:'building',id:'barracks'})).toThrow(/earned/);
        expect(()=>parseKingdomCommand({type:'recruit',id:'academy'})).toThrow();
    });
    it('uses separate server class and tier draws and keeps duplicates after the guaranteed first pack',()=>{
        let s=rich();s.buildings.barracks=1;s=pack(s,1);s=pack(s,2);
        expect(Object.keys(s.units)).toHaveLength(6);expect(s.units['pack-1-0'].investedXP).toBe(0);expect(total(s)).toBe(60);
        s=pack(s,3,[.5,.5,.5,.6,.8,.4]);expect(s.lastResult!.recruits.map(r=>r.unitId)).toEqual(['medic','ballista','hatchling']);
        expect(parseKingdom(JSON.stringify(s))).toEqual(s);
        expect(()=>pack(s,4,[.5,.5,.5])).toThrow(/random/);
        expect(()=>pack(s,4,[.5,.5,.5,1,0,0])).toThrow(/draw/);
    });
    it('rejects insufficient resources and never trusts client outcome fields',()=>{
        const s=rich();s.buildings.barracks=1;s.tokens.Life=7;expect(()=>pack(s,1)).toThrow(/Essence/);expect(s.units).toEqual({});
        expect(parseKingdomCommand({type:'recruit',id:'barracks',draws:[0],cost:0})).toEqual({type:'recruit',id:'barracks'});
    });
    it('uses pre-action odds and one shared recruitment level',()=>{
        let s=rich();s.buildings.barracks=1;for(let n=1;n<=10;n++){
            s=pack(s,n,[0,0,0,0,0,0]);
        }

        expect(s.buildings.barracks).toBe(2);expect(Object.values(s.units).every(r=>unitDefinition(r.unitId).tier===1)).toBe(true);
        s=pack(s,11,[0,.01,.999,0,0,0]);expect(s.lastResult!.recruits.map(r=>r.unitId)).toEqual(['champion','spearman','militia']);
    });
    it('merges only selected same-class spare copies, conserves XP and protects assigned and locked donors',()=>{
        let s=rich();s.buildings.barracks=1;s=pack(s,1);s=pack(s,2);const before=total(s);
        s.armySlots[0]='pack-1-0';s=applyAction(s,{type:'merge',recipient:'pack-1-0',donors:['pack-2-0','pack-2-1']});
        expect(total(s)).toBe(before);expect(recruitLevel(s.units['pack-1-0'])).toBe(2);expect(Object.keys(s.units)).toHaveLength(4);
        expect(()=>applyAction(s,{type:'merge',recipient:'pack-2-2',donors:['pack-1-0']})).toThrow(/Equipped/);
        s.units['pack-2-2'].locked=true;expect(()=>applyAction(s,{type:'merge',recipient:'pack-1-0',donors:['pack-2-2']})).toThrow(/locked/);
        expect(()=>applyAction(s,{type:'merge',recipient:'pack-1-0',donors:['pack-1-1']})).toThrow(/same class/);
        expect(()=>applyAction(s,{type:'merge',recipient:'pack-1-0',donors:['pack-1-0']})).toThrow();
    });
    it('resets old military state while preserving wallets and learning evidence',()=>{
        const s=rich();s.gold=42;s.units.a={unitId:'militia',investedXP:20,locked:false};
        const next=parseKingdom(JSON.stringify({...s,version:10}));expect(next.version).toBe(11);expect(next.units).toEqual({});expect(next.gold).toBe(42);expect(next.lifetimeGold).toBe(42);expect(next.tokens).toEqual(s.tokens);
    });
    it('keeps exact uncapped XP boundaries and rejects merge overflow',()=>{
        for(const u of UNITS){
            for(const level of [1,2,3,10,1000,100000]){
                const xp=xpThreshold(level,u.id);expect(recruitLevel({unitId:u.id,investedXP:xp,locked:false})).toBe(level);if(level>1){
                    expect(recruitLevel({unitId:u.id,investedXP:xp-1,locked:false})).toBe(level-1);
                }
            }
        }

        const s=rich();s.units={a:{unitId:'militia',investedXP:Number.MAX_SAFE_INTEGER-10,locked:false},b:{unitId:'militia',investedXP:20,locked:false}};
        expect(()=>applyAction(s,{type:'merge',recipient:'a',donors:['b']})).toThrow(/safe integer/);expect(xpProgress(s.units.a).current).toBeLessThan(xpProgress(s.units.a).required);
    });
    it('normalizes every row and preserves monotone upper tails and reference percentages',()=>{
        let prior=[0,0,0,0,0];for(let level=1;level<=100;level++){
            const row=recruitmentOdds(level);expect(row.every(p=>p>=0)).toBe(true);expect(row.reduce((a,b)=>a+b,0)).toBeCloseTo(1,12);for(let tier=1;tier<5;tier++){
                expect(row.slice(tier).reduce((a,b)=>a+b,0)+1e-14).toBeGreaterThanOrEqual(prior.slice(tier).reduce((a,b)=>a+b,0));
            }

            prior=row;
        }

        expect(recruitmentOdds(2)[0]).toBeCloseTo(.98,6);expect(recruitmentOdds(50)[2]).toBeCloseTo(.73348,5);expect(recruitmentOdds(100)[4]).toBeCloseTo(.95221,5);
        const row=recruitmentOdds(50);let sum=0;for(let tier=5;tier>=1;tier--){
            expect(unitDefinition(rollRecruit('barracks',50,sum+row[tier-1]/2)).tier).toBe(tier);sum+=row[tier-1];
        }
    });
    it('reproduces discovery percentiles analytically without guarantees',()=>{
        const result=[];for(let tier=2;tier<=5;tier++){
            let survival=1;const hits:number[]=[];for(let n=1;n<=1000;n++){
                const p=recruitmentOdds(recruitmentLevel(n-1)).slice(tier-1).reduce((a,b)=>a+b,0);survival*=(1-p)**3;for(const [i,q] of [.1,.5,.9].entries()){
                    if(hits[i]===undefined&&1-survival>=q){
                        hits[i]=n;
                    }
                }
            }

            result.push(hits);
        }

        expect(result).toEqual([[12,21,37],[108,155,189],[314,375,414],[526,578,615]]);
    });
});
describe('Recruitment persistence',()=>{
    beforeEach(()=>localStorage.clear());
    it('recovers the same copies and reveal across reload, account isolation and reset',async()=>{
        const s=rich();s.buildings.barracks=1;localStorage.setItem('curious_y_phase1_v1_demo',JSON.stringify(s));
        const epoch=demoGeneration('demo'),action={type:'recruit' as const,id:'barracks' as const};const first=await changeKingdom('demo',action,'same',epoch);
        expect(await changeKingdom('demo',action,'same',epoch)).toEqual(first);expect(Object.keys(first.units)).toHaveLength(3);expect(loadKingdom('other').units).toEqual({});
        resetKingdom('demo');await expect(changeKingdom('demo',action,'same',epoch)).rejects.toThrow(/reset/);
    });
    it('uses reserved randomness and server time in the authoritative executor',()=>{
        const s=rich();s.buildings.barracks=1;const context={state:s,revision:0,generation:0,battle_clock:null,server_now:'2026-09-08T00:00:00Z'},entropy={requestId:'reserved',draws:[.1,.2,.3,.4,.5,.6]};
        expect(executeKingdomCommand(context,{type:'recruit',id:'barracks'},entropy)).toEqual(executeKingdomCommand(context,{type:'recruit',id:'barracks'},entropy));
    });
});
