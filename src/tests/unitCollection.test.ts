import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { unitArt } from '../lib/kingdom/unitArt';
import { applyAction, createBattle, effectiveOwnedUnit, eligibleUnit, initialUnitProgress, newKingdom, parseKingdom, reconcileUnits, TOPICS, UNITS, unitStats, unitUpgradeStatus, unlockBlocker, validateArmy, type Fighter, type Kingdom, type UnitId } from '../lib/kingdom/game';
import { resolveRosterCombat } from '../../supabase/functions/_shared/unitCombat';
import { executeKingdomCommand, parseKingdomCommand } from '../../supabase/functions/learning/kingdom';
const funded = () => {
  const s = newKingdom(); s.castle = 5; s.gold = 10000; s.cleared = 50; s.libraryConcepts = 15; s.buildings.library = 1;
  for (const t of TOPICS) s.tokens[t] = 10000;
  for (const u of UNITS) s.buildings[u.building] = 5;
  return reconcileUnits(s);
};
const fighter = (kind: UnitId, id: number, side: Fighter['side'] = 'player', x = 45): Fighter => {
  const u = unitStats(kind, 1);
  return { ...u, id, kind, side, x, maxHp: u.hp, cooldown: 0, healingLeft: u.healBudget, attackCount: 0, lastAttackAt: 0, lastTarget: 0, lastTargetX: 50, slowUntil: 0, rallyUntil: 0 };
};
function arena(fighters: Fighter[]): Kingdom {
  const s = funded(); s.armySlots = ['militia', null, null, null]; s.battle = createBattle(s, 21);
  s.battle.fighters = fighters; s.battle.nextId = 100; s.battle.nextSpawn.militia = 90; s.battle.nextEnemy = 90;
  return s;
}
const step = (s: Kingdom) => applyAction(s, { type: 'tick' });
const hp = (s: Kingdom, id: number) => s.battle!.fighters.find(f => f.id === id)?.hp ?? 0;

describe('Unit collection contracts', () => {
  it('has 25 playable stable identities, assets, distinct roles, valid tags, gates and future empty slots', () => {
    expect(UNITS).toHaveLength(25); expect(new Set(UNITS.map(u => u.id)).size).toBe(25);
    expect(new Set(UNITS.map(u => u.role)).size).toBe(25);
    expect(new Set(UNITS.map(u => u.badge)).size).toBe(25);
    for (const u of UNITS) {
      expect(existsSync(`public${unitArt(u.id).portrait}`)).toBe(true);
      expect(u.tags.length).toBeGreaterThan(1); expect(u.equipmentSlots.map(x => x.id)).toEqual(['weapon','armor','charm']);
      expect(u.damage > 0 || u.ability.family === 'heal').toBe(true);
      expect(u.spawnInterval).toBeGreaterThan(0); expect(u.ability.interval).toBeGreaterThanOrEqual(.25);
      expect(u.unlock.building).toBeLessThanOrEqual(5);
    }
  });
  it('requires every acquisition milestone; owns starters automatically and preserves collected units after learning corrections', () => {
    for (const u of UNITS.filter(u => !u.starter)) {
      const s = funded(); expect(eligibleUnit(s, u.id)).toBe(false);
      expect(() => validateArmy(s, [u.id, null, null, null])).toThrow();
      const noBuilding = structuredClone(s); noBuilding.buildings[u.building] = u.unlock.building - 1;
      expect(unlockBlocker(noBuilding, u.id)).toMatch(/Requires/);
      if (u.unlock.cleared) expect(unlockBlocker({ ...s, cleared: u.unlock.cleared - 1 }, u.id)).toMatch(/Clear/);
      if (u.unlock.concepts) expect(unlockBlocker({ ...s, libraryConcepts: u.unlock.concepts - 1 }, u.id)).toMatch(/verified/);
      const unlocked = applyAction(s, { type: 'unit-unlock', id: u.id });
      expect(unlocked.units[u.id]).toEqual(initialUnitProgress()); expect(unlocked.gold).toBe(s.gold);
      expect(eligibleUnit({ ...unlocked, libraryConcepts: 0 }, u.id)).toBe(true);
      expect(applyAction(unlocked, { type: 'unit-unlock', id: u.id }).units).toEqual(unlocked.units);
    }
  });
  it('bounds purchases and rejects stale duplicate intentions without debiting balances', () => {
    let s = funded(); const before = s.gold;
    const command = { type: 'unit-level', id: 'militia', expected: 1 } as const;
    const purchased = applyAction(s, command); expect(purchased.gold).toBe(before);
    expect(purchased.tokens.Physics).toBe(s.tokens.Physics - 5);
    expect(() => applyAction(purchased, command)).toThrow(/changed/);
    expect(s.units.militia!.level).toBe(1);
    s = purchased;
    for (let level = 2; level < 5; level++) s = applyAction(s, { ...command, expected: level });
    for (let stars = 1; stars < 3; stars++) s = applyAction(s, { type: 'unit-star', id: 'militia', expected: stars });
    expect(s.gold).toBe(before);
    expect(unitUpgradeStatus(s, 'militia', 'unit-level').blocker).toMatch(/maximum/);
    expect(unitUpgradeStatus(s, 'militia', 'unit-star').blocker).toMatch(/maximum/);
    expect(unitUpgradeStatus({ ...funded(), castle: 1 }, 'militia', 'unit-level').blocker).toMatch(/Keep/);
    expect(unitUpgradeStatus(funded(), 'militia', 'unit-star').blocker).toMatch(/unit level/);
    expect(applyAction({ ...funded(), gold: 0 }, command).gold).toBe(0);
    expect(() => applyAction({ ...funded(), tokens: { ...funded().tokens, Physics: 4 } }, command)).toThrow(/Force/);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
  });
  it('validates all loadout restrictions and blocks progression during active combat', () => {
    let s = funded(); s = applyAction(s, { type: 'unit-unlock', id: 'spearman' });
    expect(() => validateArmy(s, ['spearman','spearman',null,null])).toThrow();
    expect(() => validateArmy(s, ['spearman'])).toThrow();
    expect(() => validateArmy({ ...s, buildings: { ...s.buildings, barracks: 0 } }, ['spearman',null,null,null])).toThrow();
    s = applyAction(s, { type: 'army', slots: ['spearman',null,null,null] }); s = applyAction(s, { type: 'start', stage: 51 });
    for (const c of [{ type:'unit-level', id:'spearman', expected:1 }, { type:'unit-star', id:'spearman', expected:1 }, { type:'unit-unlock', id:'ranger' }, { type:'army', slots:[null,null,null,null] }]) {
      expect(() => applyAction(s, parseKingdomCommand(c))).toThrow(/battle/);
    }
    expect(() => parseKingdomCommand({ type:'unit-level',id:'spearman',expected:1.2 })).toThrow();
    expect(() => parseKingdomCommand({ type:'unit-unlock',id:'fake' })).toThrow();
  });
  it('resets an old development roster while retaining earned construction and resources', () => {
    const old = { ...funded(), version:5, units:{ swordsman:initialUnitProgress(), 'frost-mage':initialUnitProgress() }, armySlots:['swordsman','frost-mage',null,null] };
    const s = parseKingdom(JSON.stringify(old));
    expect(s.version).toBe(6); expect(s.gold).toBe(old.gold); expect(s.tokens).toEqual(old.tokens);
    expect(s.armySlots).toEqual(['militia','medic',null,null]); expect(Object.keys(s.units)).toHaveLength(5);
    expect(s.units['frost-mage']).toBeUndefined();
    for (const patch of [{level:6}, {stars:0}, {equipment:{weapon:'fake',armor:null,charm:null}}]) {
      expect(() => parseKingdom(JSON.stringify({...s,units:{militia:{...initialUnitProgress(),...patch}}}))).toThrow(/preserved/);
    }
  });
  it('stacks unit progression before Library and towers without a rarity multiplier', () => {
    const s = funded(); s.units.militia = { ...initialUnitProgress(), level:5, stars:3 };
    expect(unitStats('militia',5,7,undefined,s.units.militia).hp).toBe(Math.round(65*2.2*1.44));
    expect(effectiveOwnedUnit(s,'militia').hp).toBe(Math.round(65*2.2*1.44*1.01));
    expect(unitStats('spearman',1).spawnInterval).toBeLessThan(unitStats('knight',1).spawnInterval);
  });
});


describe('Five class progression and combat', () => {
  it('has exactly five shared class profiles and five strict 3× tiers in each', () => {
    for (const c of ['melee','ranged','mounted','healer','siege'] as const) {
      const ladder = UNITS.filter(u => u.unitClass === c);
      expect(ladder).toHaveLength(5);
      for (let i=0;i<5;i++) {
        const u=ladder[i];
        expect(u.tier).toBe(i+1); expect(u.unlock.building).toBe(i+1);
        expect(u.unlock.cleared).toBe(i*10); expect(u.starter).toBe(i===0);
        expect(u.ability).toEqual(ladder[0].ability); expect(u.tags).toEqual(ladder[0].tags);
        expect(u.spawnInterval).toBe(ladder[0].spawnInterval); expect(u.range).toBe(ladder[0].range); expect(u.speed).toBe(ladder[0].speed);
        if(i) { expect(u.hp).toBe(ladder[i-1].hp*3); expect(u.damage).toBe(ladder[i-1].damage*3); expect(u.healing).toBe(ladder[i-1].healing*3); }
      }
    }
    expect(UNITS.find(u=>u.id==='swordsman')!.tier).toBe(3);
    expect(UNITS.find(u=>u.id==='archer')!.tier).toBe(2);
    expect(UNITS.filter(u=>u.building==='academy').every(u=>u.unitClass==='healer'&&u.damage===0)).toBe(true);
  });
  it('applies identical class bonuses and penalties for every attacker/defender tier in actual hits', () => {
    const multipliers = {
      melee:{melee:1,ranged:.75,mounted:1.5,healer:1,siege:1},
      ranged:{melee:1.5,ranged:1,mounted:.75,healer:1,siege:1},
      mounted:{melee:.75,ranged:1.5,mounted:1,healer:1,siege:1},
      siege:{melee:.75,ranged:.75,mounted:.75,healer:.75,siege:.75},
    };
    for(const source of UNITS.filter(u=>u.unitClass!=='healer')) for(const target of UNITS) {
      const a={...fighter(source.id,1),attackCount:1};
      const b={...fighter(target.id,2,'enemy',47),hp:100000,maxHp:100000,cooldown:3};
      const state=step(arena([a,b]));
      const expected=a.damage*a.damagePeriod!*multipliers[source.unitClass as keyof typeof multipliers][target.unitClass]*(1-b.armor!);
      expect(100000-hp(state,2)).toBeCloseTo(expected,5);
    }
  });
  it.each(UNITS.map(u=>[u.id] as const))('%s acts and survives snapshot reload at maximum progression', id => {
    const source=fighter(id,1), ally={...fighter('champion',2),hp:10,x:46,cooldown:3};
    const enemy={...fighter('champion',3,'enemy',48),hp:100000,maxHp:100000,cooldown:3};
    const s=step(arena([source,ally,enemy]));
    expect(s.battle!.fighters[0].attackCount).toBe(1);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    const full=funded();full.units[id]={...initialUnitProgress(),level:5,stars:3};full.armySlots=[id,null,null,null];
    full.battle=createBattle(full,41);
    expect(parseKingdom(JSON.stringify(full))).toEqual(full);
  });
  it('makes each later attacker beat its predecessor even with maximum predecessor training', () => {
    for(const unit of UNITS.filter(u=>u.tier>1&&u.unitClass!=='healer')){
      const prior=UNITS.find(u=>u.unitClass===unit.unitClass&&u.tier===unit.tier-1)!;
      const a=fighter(unit.id,1);
      const old=unitStats(prior.id,5,7,undefined,{...initialUnitProgress(),level:5,stars:3});
      const fresh=unitStats(unit.id,5);
      let s=arena([{...a,...fresh,id:1,maxHp:fresh.hp},{...fighter(prior.id,2,'enemy',47),...old,id:2,maxHp:old.hp}]);
      while(s.battle!.fighters.some(f=>f.side==='enemy')&&s.battle!.fighters.some(f=>f.side==='player')&&s.battle!.elapsed<30)s=step(s);
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
      for(let j=0;j<5;j++)expect(hp(s,j+3)).toBe(1);
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
    expect(hp(s,5)).toBe(1000);
  });
  it('agrees across catch-up and reload and bounds a full 48-fighter field', () => {
    let s=arena(Array.from({length:48},(_,i)=>({...fighter(UNITS[i%25].id,i+1,i<24?'player':'enemy',i<24?45:48),hp:100000,maxHp:100000})));
    const base={state:s,revision:0,generation:0,battle_clock:'2026-09-06T00:00:00Z',server_now:'2026-09-06T00:01:30Z'};
    const caught=executeKingdomCommand(base,{type:'tick'}).state;
    while(!s.battle!.result) {s=step(s);s=parseKingdom(JSON.stringify(s));expect(s.battle!.fighters.length).toBeLessThanOrEqual(48);}
    expect(s).toEqual(caught);expect(s.battle!.elapsed).toBeLessThanOrEqual(450);
  });
});
