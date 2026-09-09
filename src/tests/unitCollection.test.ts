import { seedRoster } from './fixtures/roster';
import { describe, expect, it } from 'vitest';
import { applyAction, createBattle, initialUnitProgress, newKingdom, parseKingdom, refreshTribute, reconcileUnits, TOPICS, UNITS, unitDefinition, unitStats, type Fighter, type Kingdom, type UnitId } from '../lib/kingdom/game';
import { resolveRosterCombat } from '../../supabase/functions/_shared/unitCombat';
import { executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
const funded = () => {
    const s = newKingdom(); s.castle = 5; s.gold = s.lifetimeGold = 10000; s.cleared = 50; s.libraryConcepts = 15; s.buildings.library = 1;
    for (const t of TOPICS) {
        s.tokens[t] = 10000;
    }

    for (const u of UNITS) {
        s.buildings[u.building] = 5;
    }

    for (const u of UNITS.filter(u=>u.tier===1)) {
        s.units[u.id]={unitId:u.id,investedXP:0,locked:false};
    }

    return seedRoster(reconcileUnits(s));
};

const fighter = (kind: UnitId, id: number, side: Fighter['side'] = 'player', x = 45): Fighter => {
    const u = unitStats(kind, 1);
    return { ...u, id, groupId:id, slotIndex:0, kind, side, x, maxHp: u.hp, cooldown: 0, healingLeft: u.healBudget, attackCount: 0, lastAttackAt: 0, lastTarget: 0, lastTargetX: 50, slowUntil: 0, rallyUntil: 0 };
};

function arena(fighters: Fighter[]): Kingdom {
    const s = funded(); s.armySlots = ['militia', null, null, null, null]; s.battle = createBattle(s, 21);
    s.battle.fighters = fighters; s.battle.nextId = 100; s.battle.nextSpawn = { 0:90 }; s.battle.nextEnemy = 90;
    return s;
}

const step = (s: Kingdom) => applyAction(s, { type: 'tick' });
const hp = (s: Kingdom, id: number) => s.battle!.fighters.find(f => f.id === id)?.hp ?? 0;

describe('Five class progression and combat', () => {
    it('has exactly five shared class profiles and five strict 3× tiers in each', () => {
        for (const c of ['melee','ranged','swarm','healer','siege'] as const) {
            const ladder = UNITS.filter(u => u.unitClass === c);
            expect(ladder).toHaveLength(5);
            for (let i=0;i<5;i++) {
                const u=ladder[i];
                expect(u.tier).toBe(i+1);
                expect(u.starter).toBe(i===0);
                expect(u.ability).toEqual(ladder[0].ability); expect(u.tags).toEqual(ladder[0].tags);
                expect(u.spawnInterval).toBe(ladder[0].spawnInterval); expect(u.range).toBe(ladder[0].range); expect(u.speed).toBe(ladder[0].speed);
                if(i) {
                    expect(u.hp).toBe(ladder[i-1].hp*3); expect(u.damage).toBeCloseTo(ladder[i-1].damage*3); expect(u.healing).toBe(ladder[i-1].healing*3); 
                }
            }
        }

        expect(UNITS.find(u=>u.id==='swordsman')!.tier).toBe(3);
        expect(UNITS.find(u=>u.id==='archer')!.tier).toBe(2);
        expect(UNITS.filter(u=>u.building==='academy').every(u=>u.unitClass==='healer'&&u.damage===0)).toBe(true);
    });
    it('applies identical class bonuses and penalties for every attacker/defender tier in actual hits', () => {
        const multipliers = {
            melee:{melee:1,ranged:.75,swarm:1.5,healer:1,siege:1},
            ranged:{melee:1.5,ranged:1,swarm:.75,healer:1,siege:1},
            swarm:{melee:.75,ranged:1.5,swarm:1,healer:1,siege:1},
            siege:{melee:.75,ranged:.75,swarm:.75,healer:.75,siege:.75},
        };
        for(const source of UNITS.filter(u=>u.unitClass!=='healer')) {
            for(const target of UNITS) {
                const a={...fighter(source.id,1),attackCount:1};
                const b={...fighter(target.id,2,'enemy',47),hp:100000,maxHp:100000,cooldown:3};
                const state=step(arena([a,b]));
                const expected=a.damage*a.damagePeriod!*multipliers[source.unitClass as keyof typeof multipliers][target.unitClass]*(1-b.armor!);
                expect(100000-hp(state,2)).toBeCloseTo(expected,5);
            }
        }
    });
    it.each(UNITS.map(u=>[u.id] as const))('%s acts and survives snapshot reload with level-10 training', id => {
        const source=fighter(id,1), ally={...fighter('champion',2),hp:10,x:46,cooldown:3};
        const enemy={...fighter('champion',3,'enemy',48),hp:100000,maxHp:100000,cooldown:3};
        const s=step(arena([source,ally,enemy]));
        expect(s.battle!.fighters[0].attackCount).toBe(1);
        expect(parseKingdom(JSON.stringify(s))).toEqual(s);
        const full=funded();for(const key of Object.keys(full.units)){
            if(unitDefinition(full.units[key].unitId).unitClass===unitDefinition(id).unitClass){
                delete full.units[key];
            }
        }

        full.units[id]={unitId:id,investedXP:540*3**(unitDefinition(id).tier-1),locked:false};full.armySlots=[id,null,null,null, null];
        full.battle=createBattle(full,41);
        expect(parseKingdom(JSON.stringify(full))).toEqual(full);
    });
    it('makes a fresh next tier beat a level-5 predecessor', () => {
        for(const unit of UNITS.filter(u=>u.tier>1&&u.unitClass!=='healer')){
            const prior=UNITS.find(u=>u.unitClass===unit.unitClass&&u.tier===unit.tier-1)!;
            const a=fighter(unit.id,1);
            const old=unitStats(prior.id,1,10,undefined,{...initialUnitProgress(),level:5});
            const fresh=unitStats(unit.id,5);
            let s=arena([{...a,...fresh,id:1,maxHp:fresh.hp},{...fighter(prior.id,2,'enemy',47),...old,id:2,maxHp:old.hp}]);
            while(s.battle!.fighters.some(f=>f.side==='enemy')&&s.battle!.fighters.some(f=>f.side==='player')&&s.battle!.elapsed<30){
                s=step(s);
            }

            expect(s.battle!.fighters.some(f=>f.side==='enemy'),unit.name).toBe(false);
            expect(s.battle!.fighters.some(f=>f.side==='player'),unit.name).toBe(true);
        }
    });
    it('scales healing and lifetime budgets by 3× and excludes every healer tier', () => {
        const healers=UNITS.filter(u=>u.unitClass==='healer');
        for(let i=0;i<healers.length;i++){
            const u=unitStats(healers[i].id,5);
            expect(u.healPerSecond).toBeCloseTo(unitStats('medic',5).healPerSecond!*3**i);
            expect(u.healBudget).toBeCloseTo(unitStats('medic',5).healBudget!*3**i);
            const a={...fighter(healers[i].id,1),healingLeft:.5}, ally={...fighter('militia',2),hp:10};
            const s=step(arena([a,ally,...healers.map((h,j)=>({...fighter(h.id,j+3),hp:1,healingLeft:0}))]));
            expect(hp(s,2)).toBe(10.5);
            for(let j=0;j<5;j++){
                expect(hp(s,j+3)).toBe(1);
            }

            const dead=step(arena([fighter(healers[i].id,1),{...ally,hp:.1,x:46},fighter('champion',3,'enemy',47)]));
            expect(hp(dead,2)).toBe(0);
        }
    });
    it('caps siege splash and applies the same unit penalty to secondary hits', () => {
        const a=fighter('ballista',1);
        const targets=[47,48,49,50].map((x,i)=>({...fighter('medic',i+2,'enemy',x),hp:1000,maxHp:1000}));
        const s=arena([a,...targets]);resolveRosterCombat(s.battle!,.25);
        expect(1000-hp(s,2)).toBeCloseTo(a.damage*3*.75);
        expect(1000-hp(s,3)).toBeCloseTo(a.damage*3*.75*.35);
        expect(1000-hp(s,5)).toBeCloseTo(a.damage*3*.75*.35);
    });
    it('agrees across catch-up and reload and bounds a full 48-fighter field', () => {
        let s=arena(Array.from({length:48},(_,i)=>({...fighter(UNITS[i%25].id,i+1,i<24?'player':'enemy',i<24?45:48),hp:100000,maxHp:100000})));
        const base={state:s,revision:0,generation:0,battle_clock:'2026-09-06T00:00:00Z',server_now:'2026-09-06T00:01:30Z'};
        refreshTribute(s,base.server_now); // Both execution paths use the same wall-clock day.
        const caught=executeKingdomCommand(base,{type:'tick'}).state;
        while(!s.battle!.result) {
            s=step(s);s=parseKingdom(JSON.stringify(s));expect(s.battle!.fighters.length).toBeLessThanOrEqual(320);
        }

        expect(s).toEqual(caught);expect(s.battle!.elapsed).toBeLessThanOrEqual(450);
    });
});
