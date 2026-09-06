import { describe, expect, it } from 'vitest';
import { applyAction, battleReward, BUILDING_DEFINITIONS, buildingCost, createBattle, Fighter, Kingdom, libraryModifiers, newKingdom, parseKingdom, TOPICS, unitStats, upgradeStatus } from '../lib/kingdom/game';
import { qualifyingConceptCount, reconcileLibrary, LibraryConcept } from '../../supabase/functions/_shared/library';
import { executeKingdomCommand, parseKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { changeKingdom, loadKingdom, resetKingdom } from '../lib/kingdom/storage';

const rich = (): Kingdom => ({ ...newKingdom(), castle: 5, gold: 10000, tokens: Object.fromEntries(TOPICS.map(t => [t, 10000])) as Kingdom['tokens'] });
function ready(): Kingdom {
  const s = rich(); s.buildings.barracks = 1; s.buildings.academy = 1;
  s.armySlots = ['swordsman', 'medic', null, null]; return s;
}
const fighter = (id: number, kind: Fighter['kind'], side: Fighter['side'], x: number, level = 1): Fighter => {
  const stats = unitStats(kind, level);
  return { ...stats, id, kind, side, x, maxHp: stats.hp, cooldown: 0, healingLeft: stats.healBudget ?? 0 };
};
function arena(fighters: Fighter[]): Kingdom {
  const s = applyAction(ready(), { type: 'start', stage: 1 });
  s.battle!.fighters = fighters; s.battle!.nextId = 30;
  s.battle!.nextSpawn = { swordsman: 90, medic: 90 }; s.battle!.nextEnemy = 90;
  return s;
}
const tick = (s: Kingdom) => applyAction(s, { type: 'tick' });
function finish(s: Kingdom) {
  for (let i = 0; i < 360 && !s.battle!.result; i++) s = tick(s);
  return s;
}
const concept = (name: string, extra: Partial<LibraryConcept> = {}): LibraryConcept => ({ canonicalName: name, aliases: [], mastery: 'proficient', reasoningTrack: { composition: 3 }, isAtomic: false, ...extra });

describe('Castle progression contracts', () => {
  it('checks every purchase gate, cap, exact price and prohibited future/knowledge command', () => {
    for (const b of BUILDING_DEFINITIONS) {
      const s = rich();
      if (b.mode !== 'purchase') {
        expect(() => applyAction(s, { type: 'building', id: b.id })).toThrow();
        expect(() => parseKingdomCommand({ type: 'building', id: b.id })).toThrow();
        continue;
      }
      if (b.unlock > 1) {
        s.castle = b.unlock - 1;
        expect(upgradeStatus(s, { type: 'building', id: b.id }).ready).toBe(false);
      }
      s.castle = 5;
      let next = s;
      for (let level = 0; level < b.cap; level++) {
        const cost = buildingCost(b.id, level);
        expect(cost.gold).toBe(level * 20);
        expect(Object.values(cost.resources).every(n => n === b.cost / 2 * (level + 1))).toBe(true);
        const before = next; next = applyAction(next, { type: 'building', id: b.id });
        expect(next.gold).toBe(before.gold - cost.gold);
        expect(next.buildings[b.id]).toBe(level + 1);
      }
      expect(() => applyAction(next, { type: 'building', id: b.id })).toThrow(/maximum/);
      expect(parseKingdom(JSON.stringify(next))).toEqual(next);
    }
  });

  it('migrates v2 ownership, pending battle obligations and explicit slots without repricing', () => {
    const s = ready(); s.buildings.range = 4; s.buildings.stable = 2; s.buildings.workshop = 3;
    s.armySlots = [null, 'swordsman', null, null]; s.battle = createBattle(s);
    const old = JSON.parse(JSON.stringify(s)); old.version = 2;
    for (const key of ['academy', 'treasury', 'library', 'forge']) delete old.buildings[key];
    delete old.libraryConcepts;
    old.battle.config.rulesVersion = 2; delete old.battle.config.reward; delete old.battle.config.keepLevel;
    delete old.battle.paidGold;
    const migrated = parseKingdom(JSON.stringify(old));
    expect(migrated.version).toBe(4);
    expect(migrated.buildings).toEqual({ ...s.buildings, academy: 0 });
    expect(migrated.armySlots).toEqual(s.armySlots);
    expect(migrated.gold).toBe(s.gold);
    expect(buildingCost('range', migrated.buildings.range)).toEqual({ gold: 80, resources: { 'Earth & Space': 75, 'Mind & Behavior': 75 } });
    expect(battleReward(migrated.battle!).totalGold).toBe(60);
    expect(parseKingdom(JSON.stringify(migrated))).toEqual(migrated);
    const broken = { ...migrated, buildings: { ...migrated.buildings, academy: undefined } };
    expect(() => parseKingdom(JSON.stringify(broken))).toThrow(/preserved/);
  });

  it('applies armor, reach, movement, splash and authoritative reload in real ticks', () => {
    const sword = fighter(1, 'swordsman', 'player', 45, 5);
    const enemy = fighter(2, 'swordsman', 'enemy', 47);
    let s = tick(arena([sword, enemy]));
    expect(s.battle!.fighters[0].hp).toBeCloseTo(sword.hp - enemy.damage * .25 * .84);
    const archer = fighter(1, 'archer', 'player', 25, 5);
    s = tick(arena([archer, fighter(2, 'swordsman', 'enemy', 49)]));
    expect(s.battle!.fighters[1].hp).toBeLessThan(65); // 24 units away; base reach is 18.
    const knight = fighter(1, 'knight', 'player', 10, 5);
    s = tick(arena([knight]));
    expect(s.battle!.fighters[0].x).toBeCloseTo(10 + unitStats('knight', 1).speed * 1.4 * .25);
    const catapult = fighter(1, 'catapult', 'player', 30, 5);
    s = arena([catapult, ...[50, 51, 52, 53].map((x, i) => fighter(i + 2, 'knight', 'enemy', x, 5))]);
    const before = s.battle!.fighters.map(f => f.hp); s = tick(s);
    expect(before[1] - s.battle!.fighters[1].hp).toBeCloseTo(catapult.damage * 3);
    expect(before[2] - s.battle!.fighters[2].hp).toBeCloseTo(catapult.damage * 3 * .35);
    expect(before[3] - s.battle!.fighters[3].hp).toBeCloseTo(catapult.damage * 3 * .35);
    expect(s.battle!.fighters[4].hp).toBe(before[4]); // Only two splash targets.
    const firstHp = s.battle!.fighters[1].hp;
    s = tick(s); expect(s.battle!.fighters[1].hp).toBe(firstHp);
    expect(s.battle!.fighters[0].cooldown).toBe(catapult.attackInterval! - .25);
  });

  it('heals actual damage with finite budgets, no healer chains, overheal, Keep healing or resurrection', () => {
    const medic = fighter(1, 'medic', 'player', 40);
    const injured = { ...fighter(2, 'swordsman', 'player', 43), hp: 10, speed: .01 };
    const otherMedic = { ...fighter(3, 'medic', 'player', 41), hp: 1, healingLeft: 0 };
    let s = arena([medic, injured, otherMedic]);
    s.battle!.playerHp = 20;
    s = tick(s);
    expect(s.battle!.fighters[1].hp).toBe(10.75);
    expect(s.battle!.fighters[2].hp).toBe(1);
    expect(s.battle!.playerHp).toBe(20);
    for (let i = 0; i < 80; i++) s = tick(s);
    expect(s.battle!.fighters[0].healingLeft).toBe(0);
    expect(s.battle!.fighters[1].hp).toBe(34);
    const nearlyFull = { ...injured, hp: injured.maxHp - .1 };
    expect(tick(arena([medic, nearlyFull])).battle!.fighters[1].hp).toBe(nearlyFull.maxHp);
    const lethal = tick(arena([medic, { ...injured, hp: .1 }, fighter(4, 'swordsman', 'enemy', 44)]));
    expect(lethal.battle!.fighters.some(f => f.id === 2)).toBe(false);
  });

  it('uses the normal four slots, recruits Medics every 12s and bounds a support-only battle', () => {
    const s = ready(); s.armySlots = ['medic', null, null, null];
    expect(() => applyAction(s, { type: 'army', slots: ['medic', 'medic', null, null] })).toThrow();
    const end = finish(applyAction(s, { type: 'start', stage: 1 }));
    expect(end.battle!.elapsed).toBeLessThanOrEqual(90);
    expect(end.battle!.result).not.toBe('victory');
    expect(end.battle!.playerSpawned).toBeLessThanOrEqual(7);
    expect(parseKingdom(JSON.stringify(end))).toEqual(end);
  });

  it('freezes Library and Treasury through live catch-up, upgrades before collection, and retries', () => {
    const s = ready(); s.buildings.treasury = 1; s.buildings.library = 4; s.libraryConcepts = 150;
    let battle = applyAction(s, { type: 'start', stage: 1 });
    expect(battle.battle!.config.slots[0]!.hp).toBe(unitStats('swordsman', 1, undefined, libraryModifiers(s)).hp);
    const context = { state: battle, revision: 0, generation: 0, battle_clock: '2026-09-06T10:00:00Z', server_now: '2026-09-06T10:02:00Z' };
    battle = executeKingdomCommand(context, { type: 'tick' }).state;
    expect(battle.battle!.result).toBe('victory');
    const upgraded = applyAction(battle, { type: 'building', id: 'treasury' });
    const paid = applyAction(parseKingdom(JSON.stringify(upgraded)), { type: 'collect-battle', stage: 1 });
    expect(paid.gold - upgraded.gold).toBe(61);
    expect(paid.battle!.paidGold).toBe(61);
    expect(applyAction(paid, { type: 'collect-battle', stage: 1 })).toBe(paid);
    expect(createBattle(paid).config.reward!.treasuryPercent).toBe(4);
  });

  it('crosses every knowledge threshold, deduplicates transitive aliases and excludes atomic or unearned groups', () => {
    for (const n of [0, 9, 10, 29, 30, 74, 75, 149, 150, 151]) {
      const concepts = Array.from({ length: n }, (_, i) => concept(`Concept ${i}`));
      const s = reconcileLibrary(newKingdom(), concepts);
      expect(s.buildings.library).toBe([10, 30, 75, 150].filter(k => n >= k).length);
      expect(reconcileLibrary(s, concepts)).toBe(s);
      expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    }
    const concepts = [concept('A', { aliases: [' B '] }), concept('b', { aliases: ['c'] }), concept('C'),
      concept('Atomic', { isAtomic: true, mastery: 'mastered', aliases: ['Duplicate'] }), concept('duplicate'),
      concept('Assumed', { reasoningTrack: {} }), concept('Learning', { mastery: 'learning' })];
    expect(qualifyingConceptCount(concepts)).toBe(1);
    expect(concepts[3].mastery).toBe('mastered');
  });

  it('reconciles Demo refresh and reset per account and preserves zero-value learning receipts', async () => {
    localStorage.clear();
    const owner = 'demo-library';
    localStorage.setItem(`curious_y_user_concepts_${owner}`, JSON.stringify(Array.from({ length: 10 }, (_, i) => concept(`Topic ${i}`))));
    expect(loadKingdom(owner).buildings.library).toBe(1);
    expect(loadKingdom('other-demo').buildings.library).toBe(0);
    await changeKingdom(owner, { type: 'army', slots: [null, null, null, null] });
    expect(loadKingdom(owner).buildings.library).toBe(1);
    localStorage.removeItem(`curious_y_user_concepts_${owner}`); resetKingdom(owner);
    expect(loadKingdom(owner)).toEqual(newKingdom());
    const s = applyAction(newKingdom(), { type: 'answer', id: 'zero', topic: 'Physics', correct: false,
      reward: { id: 'zero', correct: false, totalKnowledge: 0, lines: [], topicWeights: { Physics: 1 } } });
    expect(s.rewarded).toEqual(['zero']); expect(s.tokens.Physics).toBe(0);
  });
});
