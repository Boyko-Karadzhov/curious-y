import { seedRoster } from './fixtures/roster';
import { LEGACY_UNITS as UNITS } from '../../supabase/functions/_shared/legacyUnits';
import { describe, expect, it } from 'vitest';
import { applyAction, createBattle, newKingdom, parseKingdom, reconcileUnits, TOPICS, unitStats, type Fighter, type Kingdom, type UnitId } from '../lib/kingdom/game';
import { rosterTarget, resolveRosterCombat } from '../../supabase/functions/_shared/unitCombat';
import { executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import rules4 from './fixtures/rules4-roster-migration.json';
const funded = () => {
  const s = newKingdom(); s.castle = 5; s.gold = 10000; s.cleared = 20; s.libraryConcepts = 15; s.buildings.library = 1;
  for (const t of TOPICS) s.tokens[t] = 10000;
  for (const u of UNITS) s.buildings[u.building] = 3;
  return seedRoster(reconcileUnits(s));
};
const fighter = (kind: UnitId, id: number, side: Fighter['side'] = 'player', x = 45): Fighter => {
  const u = unitStats(kind, 1, 5);
  return { ...u, id, kind, side, x, maxHp: u.hp, cooldown: 0, healingLeft: u.healBudget, attackCount: 0, lastAttackAt: 0, lastTarget: 0, lastTargetX: 50, slowUntil: 0, rallyUntil: 0 };
};
function arena(fighters: Fighter[]): Kingdom {
  const s = funded(); s.armySlots = ['militia', null, null, null, null]; s.battle = createBattle(s, 21);
  s.battle.playerHp=720; s.battle.playerMaxHp=720; s.battle.config.rulesVersion = 5; s.battle.config.maxSeconds = 90; s.battle.config.slots = [unitStats('swordsman',3,5),null,null,null]; s.battle.config.enemy.units = [unitStats('knight',3,5)]; s.battle.nextSpawn = {swordsman:90}; s.battle.fighters = fighters; s.battle.nextId = 100; s.battle.nextSpawn.swordsman = 90; s.battle.nextEnemy = 90;
  return s;
}
const step = (s: Kingdom) => applyAction(s, { type: 'tick' });
const hp = (s: Kingdom, id: number) => s.battle!.fighters.find(f => f.id === id)?.hp ?? 0;

describe('Historical roster snapshots', () => {
  it('explicitly resets historical military state and pending battles on the new economy', () => {
    for (const {saved} of rules4) { const state=parseKingdom(JSON.stringify(saved)); expect(state.battle).toBeNull();expect(state.cleared).toBe(0);expect(state.units).toEqual({});expect(state.tokens).toEqual(saved.tokens); }
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
    const s=arena([fighter('clockwork-gunner',1),fighter('spearman',2),fighter('frost-mage',3),fighter('astral-colossus',4),fighter('knight',5,'enemy',48)]);
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
