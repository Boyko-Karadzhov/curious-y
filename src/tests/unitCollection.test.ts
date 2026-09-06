import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { applyAction, createBattle, effectiveOwnedUnit, eligibleUnit, initialUnitProgress, newKingdom, parseKingdom, reconcileUnits, TOPICS, UNITS, unitStats, unitUpgradeStatus, unlockBlocker, validateArmy, type Fighter, type Kingdom, type UnitId } from '../lib/kingdom/game';
import { rosterTarget, resolveRosterCombat } from '../../supabase/functions/_shared/unitCombat';
import { executeKingdomCommand, parseKingdomCommand } from '../../supabase/functions/learning/kingdom';
import rules4 from './fixtures/rules4-roster-migration.json';
const funded = () => {
  const s = newKingdom(); s.castle = 5; s.gold = 10000; s.cleared = 20; s.libraryConcepts = 15; s.buildings.library = 1;
  for (const t of TOPICS) s.tokens[t] = 10000;
  for (const u of UNITS) s.buildings[u.building] = 3;
  return reconcileUnits(s);
};
const fighter = (kind: UnitId, id: number, side: Fighter['side'] = 'player', x = 45): Fighter => {
  const u = unitStats(kind, 1);
  return { ...u, id, kind, side, x, maxHp: u.hp, cooldown: 0, healingLeft: u.healBudget, attackCount: 0, lastAttackAt: 0, lastTarget: 0, lastTargetX: 50, slowUntil: 0, rallyUntil: 0 };
};
function arena(fighters: Fighter[]): Kingdom {
  const s = funded(); s.armySlots = ['swordsman', null, null, null]; s.battle = createBattle(s, 21);
  s.battle.fighters = fighters; s.battle.nextId = 100; s.battle.nextSpawn.swordsman = 90; s.battle.nextEnemy = 90;
  return s;
}
const step = (s: Kingdom) => applyAction(s, { type: 'tick' });
const hp = (s: Kingdom, id: number) => s.battle!.fighters.find(f => f.id === id)?.hp ?? 0;

describe('Unit collection contracts', () => {
  it('continues real rules-4 combat and pending rewards exactly as the pre-roster engine', () => {
    for (const { saved, expected } of rules4) {
      let state = parseKingdom(JSON.stringify(saved));
      while (!state.battle!.result) state = step(state);
      expect(state.battle).toEqual(expected.battle);
      expect(state.gold).toBe(expected.gold); expect(state.tokens).toEqual(expected.tokens);
      expect(state.cleared).toBe(expected.cleared);
      const restored = parseKingdom(JSON.stringify(state));
      if (restored.battle!.result === 'victory') {
        const paid = applyAction(restored, { type:'collect-battle',stage:restored.battle!.stage });
        expect(paid.gold).toBe(expected.gold + expected.battle!.config.reward!.totalGold);
        expect(applyAction(paid,{type:'collect-battle',stage:paid.battle!.stage})).toBe(paid);
      }
    }
  });
  it('has 20 playable stable identities, assets, distinct roles, valid tags, gates and future empty slots', () => {
    expect(UNITS).toHaveLength(20); expect(new Set(UNITS.map(u => u.id)).size).toBe(20);
    expect(new Set(UNITS.map(u => u.role)).size).toBe(20);
    expect(new Set(UNITS.map(u => u.badge)).size).toBe(20);
    for (const u of UNITS) {
      expect(existsSync(`public${u.asset}`)).toBe(true);
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
    const command = { type: 'unit-level', id: 'swordsman', expected: 1 } as const;
    const purchased = applyAction(s, command); expect(purchased.gold).toBe(before - 20);
    expect(purchased.tokens.Physics).toBe(s.tokens.Physics - 5);
    expect(() => applyAction(purchased, command)).toThrow(/changed/);
    expect(s.units.swordsman!.level).toBe(1);
    s = purchased;
    for (let level = 2; level < 5; level++) s = applyAction(s, { ...command, expected: level });
    for (let stars = 1; stars < 3; stars++) s = applyAction(s, { type: 'unit-star', id: 'swordsman', expected: stars });
    expect(s.gold).toBe(before - 200 - 180);
    expect(unitUpgradeStatus(s, 'swordsman', 'unit-level').blocker).toMatch(/maximum/);
    expect(unitUpgradeStatus(s, 'swordsman', 'unit-star').blocker).toMatch(/maximum/);
    expect(unitUpgradeStatus({ ...funded(), castle: 1 }, 'swordsman', 'unit-level').blocker).toMatch(/Keep/);
    expect(unitUpgradeStatus(funded(), 'swordsman', 'unit-star').blocker).toMatch(/unit level/);
    expect(() => applyAction({ ...funded(), gold: 0 }, command)).toThrow(/need/);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
  });
  it('validates all loadout restrictions and blocks progression during active combat', () => {
    let s = funded(); s = applyAction(s, { type: 'unit-unlock', id: 'spearman' });
    expect(() => validateArmy(s, ['spearman','spearman',null,null])).toThrow();
    expect(() => validateArmy(s, ['spearman'])).toThrow();
    expect(() => validateArmy({ ...s, buildings: { ...s.buildings, barracks: 0 } }, ['spearman',null,null,null])).toThrow();
    s = applyAction(s, { type: 'army', slots: ['spearman',null,null,null] }); s = applyAction(s, { type: 'start', stage: 21 });
    for (const c of [{ type:'unit-level', id:'spearman', expected:1 }, { type:'unit-star', id:'spearman', expected:1 }, { type:'unit-unlock', id:'slinger' }, { type:'army', slots:[null,null,null,null] }]) {
      expect(() => applyAction(s, parseKingdomCommand(c))).toThrow(/battle/);
    }
    expect(() => parseKingdomCommand({ type:'unit-level',id:'spearman',expected:1.2 })).toThrow();
    expect(() => parseKingdomCommand({ type:'unit-unlock',id:'fake' })).toThrow();
  });
  it('migrates v4 wallets, investments, pending rewards and original power with no paid upgrades', () => {
    const s = funded(); s.armySlots = ['swordsman','archer','knight','catapult'];
    const old = { ...s, version: 4, units: undefined };
    const migrated = parseKingdom(JSON.stringify(old));
    expect(migrated.gold).toBe(s.gold); expect(migrated.tokens).toEqual(s.tokens); expect(migrated.buildings).toEqual(s.buildings);
    expect(migrated.cleared).toBe(s.cleared); expect(migrated.armySlots).toEqual(s.armySlots);
    for (const u of UNITS.filter(u => u.starter)) {
      expect(migrated.units[u.id]).toEqual(initialUnitProgress());
      expect(unitStats(u.id, 3, 5).hp).toBe(unitStats(u.id, 3, 4).hp);
      expect(unitStats(u.id, 3, 5).damage).toBe(unitStats(u.id, 3, 4).damage);
    }
    expect(Object.keys(migrated.units)).toHaveLength(5);
    expect(() => parseKingdom(JSON.stringify({ ...s, units: undefined }))).toThrow(/preserved/);
    for (const patch of [{ level: 6 }, { stars: 0 }, { equipment: { weapon:'fake',armor:null,charm:null } }]) {
      expect(() => parseKingdom(JSON.stringify({ ...s, units: { swordsman: { ...initialUnitProgress(), ...patch } } }))).toThrow(/preserved/);
    }
    expect(newKingdom().units).toEqual({});
  });
  it('stacks unit progression before Library and towers without a rarity multiplier', () => {
    const s = funded(); s.units.swordsman = { ...initialUnitProgress(), level:5, stars:3 };
    expect(unitStats('swordsman',3,5,undefined,s.units.swordsman).hp).toBe(Math.round(65*1.6*1.44));
    expect(effectiveOwnedUnit(s,'swordsman').hp).toBe(Math.round(65*1.6*1.44*1.01));
    expect(unitStats('spearman',1).spawnInterval).toBeLessThan(unitStats('knight',1).spawnInterval);
  });
});

describe('Authoritative ability families', () => {
  it.each(UNITS.map(u => [u.id] as const))('%s acts on the field and round-trips its snapshot', id => {
    const attacker = fighter(id,1); const ally = { ...fighter('swordsman',2), hp:10, x:46 };
    const enemy = { ...fighter('knight',3,'enemy',48), hp:1000, maxHp:1000 };
    const s = step(arena([attacker,ally,enemy]));
    expect(s.battle!.fighters[0].attackCount).toBe(1);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
  });
  it('common Spearman deals 2.5x cavalry damage and selects a cavalry target in reach', () => {
    const spear = fighter('spearman',1), knight = fighter('knight',2,'enemy',49), sword = fighter('archer',3,'enemy',48);
    expect(rosterTarget(spear,[spear,knight,sword])?.id).toBe(2);
    const result = step(arena([spear,knight,sword]));
    expect(knight.hp-hp(result,2)).toBeCloseTo(spear.damage*2.5);
    const normal = step(arena([spear,{...sword,id:2}]));
    expect(sword.hp-hp(normal,2)).toBeCloseTo(spear.damage);
  });
  it('three common Spearmen counter two rare Knights at equal building/unit tiers and an 18-second recruitment budget', () => {
    let s=arena([fighter('spearman',1),fighter('spearman',2),fighter('spearman',3),fighter('knight',4,'enemy',48),fighter('knight',5,'enemy',48)]);
    while(s.battle!.fighters.some(f=>f.side==='enemy') && s.battle!.elapsed<30)s=step(s);
    expect(s.battle!.elapsed).toBe(10.25);
    expect(s.battle!.fighters.map(f=>f.kind)).toEqual(['spearman','spearman']);
    expect(unitStats('spearman',1).spawnInterval*3).toBeLessThanOrEqual(18);
    expect(unitStats('knight',1).spawnInterval*2).toBe(18);
  });
  it('persists four shots through reload; the fifth bypasses armor and pierces only two targets behind', () => {
    const gun = { ...fighter('clockwork-gunner',1), attackCount:3 };
    const enemies = [49,52,55,58].map((x,i) => ({...fighter('shieldbearer',i+2,'enemy',x), hp:1000,maxHp:1000,speed:.01,damage:.01}));
    let s = step(arena([gun,...enemies]));
    expect(s.battle!.fighters[0].attackCount).toBe(4); expect(hp(s,3)).toBe(1000);
    s = parseKingdom(JSON.stringify(s)); const before = s;
    for(let i=0;i<3;i++) s=step(s);
    expect(s.battle!.fighters[0].attackCount).toBe(5);
    expect(hp(before,2)-hp(s,2)).toBeCloseTo(gun.damage*.75);
    expect(1000-hp(s,3)).toBeCloseTo(gun.damage*.75); expect(1000-hp(s,4)).toBeCloseTo(gun.damage*.75);
    expect(hp(s,5)).toBe(1000);
    const corrupt=structuredClone(s); corrupt.battle!.fighters[0].attackCount=NaN;
    expect(()=>parseKingdom(JSON.stringify(corrupt))).toThrow(/preserved/);
  });
  it('area damage has a radius and target cap; guard reduces hits; Duelist bypasses guard', () => {
    const colossus = fighter('astral-colossus',1);
    const enemies = [49,50,51,52,53,54,65].map((x,i)=>fighter('slinger',i+2,'enemy',x));
    const s = step(arena([colossus,...enemies]));
    expect(hp(s,2)).toBe(0); expect(hp(s,3)).toBe(enemies[1].hp-12);
    expect(hp(s,6)).toBe(enemies[4].hp-12); expect(hp(s,7)).toBe(enemies[5].hp); expect(hp(s,8)).toBe(enemies[6].hp);
    const shield = fighter('shieldbearer',2,'enemy',47), sword = fighter('swordsman',1), duel = fighter('duelist',1);
    expect(shield.hp-hp(step(arena([sword,shield])),2)).toBeCloseTo(sword.damage*.72);
    expect(shield.hp-hp(step(arena([duel,shield])),2)).toBeCloseTo(duel.damage);
  });
  it('charge is first attack only; execute requires below half health', () => {
    const lancer=fighter('lancer',1), enemy={...fighter('archer',2,'enemy',48),hp:1000,maxHp:1000,damage:.01};
    let s=step(arena([lancer,enemy])); expect(1000-hp(s,2)).toBeCloseTo(lancer.damage*1.5*3);
    const first=hp(s,2); for(let i=0;i<6;i++) s=step(s);
    expect(first-hp(s,2)).toBeCloseTo(lancer.damage*1.5);
    const berserker=fighter('berserker',1);
    expect(400-hp(step(arena([berserker,{...enemy,hp:400}])),2)).toBeCloseTo(berserker.damage*1.8);
    expect(1000-hp(step(arena([berserker,enemy])),2)).toBeCloseTo(berserker.damage);
  });
  it('healing is capped, excludes healers and Keeps, and cannot resurrect', () => {
    const medic=fighter('medic',1), ally={...fighter('swordsman',2),hp:64}, other={...fighter('medic',3),hp:1,healingLeft:0};
    let s=step(arena([medic,ally,other])); expect(hp(s,2)).toBe(65); expect(hp(s,3)).toBe(1); expect(s.battle!.fighters[0].healingLeft).toBe(23);
    s=step(arena([{...medic,healingLeft:.5},{...ally,hp:10}])); expect(hp(s,2)).toBe(10.5);
    s=step(arena([medic,{...ally,hp:.1,x:46},fighter('knight',4,'enemy',47)])); expect(hp(s,2)).toBe(0);
    expect(s.battle!.playerHp).toBe(s.battle!.playerMaxHp);
  });
  it('slow and rally are capped, expire and apply after simultaneous decisions', () => {
    const frost=fighter('frost-mage',1), target=fighter('knight',2,'enemy',55);
    const s=step(arena([frost,target])); expect(s.battle!.fighters[1].slowUntil).toBe(2.25);
    const next=step(s); expect(hp(next,2)).toBe(hp(s,2));
    expect(s.battle!.fighters[1].x-next.battle!.fighters[1].x).toBeCloseTo(target.speed*.7*.25);
    const sage=fighter('battle-sage',1); const sword=fighter('swordsman',2); const enemy={...fighter('archer',3,'enemy',47),hp:1000,maxHp:1000};
    const rallied=step(arena([sage,sword,enemy])); expect(rallied.battle!.fighters[1].rallyUntil).toBe(2.75);
    expect(1000-hp(rallied,3)).toBeCloseTo(sage.damage*2+sword.damage);
    const unbuffed=structuredClone(rallied); unbuffed.battle!.fighters[1].rallyUntil=0;
    let buffed=rallied, normal=unbuffed; for(let i=0;i<4;i++){buffed=step(buffed);normal=step(normal);}
    expect(hp(normal,3)-hp(buffed,3)).toBeCloseTo(sword.damage*.15);
  });
  it('resolves simultaneous lethal hits and castle destruction; ignores dead/out-of-reach preferred targets', () => {
    const a={...fighter('duelist',1),hp:1}, b={...fighter('duelist',2,'enemy',47),hp:1};
    expect(step(arena([a,b])).battle!.fighters).toHaveLength(0);
    const s=arena([{...a,x:99},{...b,x:1}]);s.battle!.playerHp=1;s.battle!.enemyHp=1;
    expect(step(s).battle!.result).toBe('draw');
    const spear=fighter('spearman',1);expect(rosterTarget(spear,[spear,{...b,hp:0},fighter('knight',3,'enemy',90),fighter('archer',4,'enemy',48)])!.id).toBe(4);
  });
  it('agrees across polling, catch-up and reload for the expanded abilities and keeps field caps', () => {
    let s=funded();for(const id of ['clockwork-gunner','spearman','frost-mage','astral-colossus'] as const)s=applyAction(s,{type:'unit-unlock',id});
    s=applyAction(s,{type:'army',slots:['clockwork-gunner','spearman','frost-mage','astral-colossus']});s=applyAction(s,{type:'start',stage:21});
    const base={state:s,revision:0,generation:0,battle_clock:'2026-09-06T00:00:00Z',server_now:'2026-09-06T00:01:30Z'};
    const caught=executeKingdomCommand(base,{type:'tick'}).state;
    let split=s;
    for(let i=0;i<360&&!split.battle!.result;i++) {split=step(split); if(i%13===0)split=parseKingdom(JSON.stringify(split));}
    expect(caught).toEqual(split); expect(split.battle!.elapsed).toBeLessThanOrEqual(90);
    const stress=arena(UNITS.slice(0,12).flatMap((u,i)=>[fighter(u.id,i+1,'player',40),fighter(u.id,i+13,'enemy',44)]));
    stress.battle!.elapsed=.25; resolveRosterCombat(stress.battle!,.25);expect(stress.battle!.fighters.length).toBeLessThanOrEqual(24);
  });
  it('sustains the full 48-fighter field for 360 bounded simulation steps', () => {
    let s=arena(Array.from({length:48},(_,i)=>({...fighter(UNITS[i%20].id,i+1,i<24?'player':'enemy',i<24?45:48),hp:100000,maxHp:100000})));
    const started=performance.now();
    for(let i=0;i<360;i++) {
      s=step(s);
      expect(s.battle!.fighters.filter(f=>f.side==='player').length).toBeLessThanOrEqual(24);
      expect(s.battle!.fighters.filter(f=>f.side==='enemy').length).toBeLessThanOrEqual(24);
    }
    expect(s.battle!.result).toBe('draw');expect(s.battle!.elapsed).toBe(90);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    expect(performance.now()-started).toBeLessThan(3000);
  });
});
