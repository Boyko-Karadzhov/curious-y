import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_RESOURCES } from '../../supabase/functions/_shared/resources';
import { LibraryConcept, qualifyingConcepts, reconcileLibrary } from '../../supabase/functions/_shared/library';
import { TOWERS, TOWER_SCALE, TOWER_THRESHOLDS, applyTowerModifiers, emptyTowers, towerLevel, towerEffect } from '../../supabase/functions/_shared/towers';
import { applyAction, createBattle, libraryModifiers, newKingdom, parseKingdom, unitStats, UNITS } from '../lib/kingdom/game';
import { executeKingdomCommand, parseKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { changeKingdom, loadKingdom, resetKingdom } from '../lib/kingdom/storage';
import { answerDemoQuestion, clearDemoPending, resetDemoLearning } from '../lib/kingdom/demoLearning';
import { Concept } from '../types';

const concept = (canonicalName: string, topics = { Physics: 1 } as Record<string, number>, extra: Partial<LibraryConcept> = {}): LibraryConcept =>
  ({ canonicalName, topics, aliases: [], mastery: 'proficient', reasoningTrack: { composition: 3 }, ...extra });
const profile = (key: typeof TOWERS[number]['key']) => { const t = emptyTowers(); t.points[key] = 15 * TOWER_SCALE; return t; };
const ready = () => { const s = newKingdom(); s.buildings.barracks = 1; s.armySlots = ['swordsman', null, null, null]; return s; };

describe('Knowledge Towers', () => {
  it('maps all eight canonical topics once with stable IDs, appearances, caps and exact boundaries', () => {
    expect(TOWERS.map(t => t.topic)).toEqual(KNOWLEDGE_RESOURCES.map(r => r.topic));
    expect(new Set(TOWERS.map(t => t.id)).size).toBe(8);
    expect(new Set(TOWERS.map(t => t.appearance)).size).toBe(8);
    for (const t of TOWERS) {
      expect(t.id).toBe(`tower-${t.key}`); expect(t.cap).toBe(5);
      const s = reconcileLibrary(newKingdom(), [concept(t.name, { [t.topic]: 1 })]);
      expect(s.towers.points[t.key]).toBe(TOWER_SCALE);
      expect(Object.values(s.towers.points).reduce((a, b) => a + b)).toBe(TOWER_SCALE);
      expect(towerEffect(t.key, 5)).not.toBe(towerEffect(t.key, 0));
    }
    TOWER_THRESHOLDS.forEach((n, i) => {
      expect(towerLevel(n * TOWER_SCALE - 1)).toBe(i); expect(towerLevel(n * TOWER_SCALE)).toBe(i + 1);
    });
    expect(towerLevel(999 * TOWER_SCALE)).toBe(5);
  });

  it('normalizes exact fixed-point shares, deterministic ties and malformed or unclassified topics', () => {
    const s = reconcileLibrary(newKingdom(), [concept('Mixed', { Physics: 7, Life: 2, Chemistry: 1 })]);
    expect(s.towers.points).toEqual({ ...emptyTowers().points, force: 700000, essence: 200000, reagents: 100000 });
    const thirds = reconcileLibrary(newKingdom(), [concept('Thirds', { Physics: 1, Life: 1, Chemistry: 1 })]);
    expect(thirds.towers.points.force).toBe(333334); expect(thirds.towers.points.essence).toBe(333333);
    for (const topics of [{ unknown: 1 }, { Physics: -1 }, { Physics: NaN }, {}] as Record<string, number>[]) {
      const s = reconcileLibrary(newKingdom(), [concept('Unclassified', topics)]);
      expect(s.libraryConcepts).toBe(1); expect(s.towers).toEqual(emptyTowers());
    }
  });

  it('shares eligibility and stable alias representatives; atomic and assumed groups never count', () => {
    const concepts = [concept('B', { Life: 1 }, { aliases: ['a', 'c'] }), concept('A'), concept('c'),
      concept('Atomic', { Life: 1 }, { isAtomic: true, aliases: ['Duplicate'] }), concept('duplicate'),
      concept('Assumed', { Physics: 1 }, { mastery: 'mastered', reasoningTrack: {} }),
      concept('In progress', { Physics: 1 }, { mastery: 'learning' })];
    expect(qualifyingConcepts(concepts).map(c => c.canonicalName)).toEqual(['A']);
    const s = reconcileLibrary(newKingdom(), concepts);
    expect(s.libraryConcepts).toBe(1); expect(s.towers.points.force).toBe(TOWER_SCALE);
    expect(reconcileLibrary(newKingdom(), [...concepts].reverse())).toEqual(s);
    expect(reconcileLibrary(s, concepts)).toBe(s);
    const corrected = reconcileLibrary(s, [concept('A', { Life: 1 })]);
    expect(corrected.towers.points.force).toBe(0); expect(corrected.towers.points.essence).toBe(TOWER_SCALE);
    expect(reconcileLibrary(corrected, []).towers).toEqual(emptyTowers());
  });

  it('applies every domain to actual stats with additive damage and multiplicative Library stacking', () => {
    const all = emptyTowers(); TOWERS.forEach(t => all.points[t.key] = 15 * TOWER_SCALE);
    const base = unitStats('catapult', 5), siege = applyTowerModifiers(base, all);
    expect(siege.damage).toBeCloseTo(base.damage * (1 + .025 + .025 + .02));
    expect(siege.castleMultiplier).toBe(3.075); expect(siege.armor).toBe(.015);
    expect(siege.splashFraction).toBe(.37); expect(siege.range).toBeCloseTo(base.range * 1.025);
    expect(siege.spawnInterval).toBeCloseTo(base.spawnInterval / 1.02, 5); expect(siege.speed).toBe(base.speed);
    const s = ready(); s.buildings.library = 4; s.libraryConcepts = 150; s.towers = all;
    expect(createBattle(s).config.slots[0]!.hp).toBeCloseTo(unitStats('swordsman', 1, undefined, libraryModifiers(s)).hp * 1.025);
    const healer = applyTowerModifiers(unitStats('medic', 5), all);
    expect(healer.healBudget).toBe(48.96); expect(healer.healPerSecond).toBe(7.14); expect(healer.damage).toBe(0);
    expect(healer.speed).toBeCloseTo(2 * 1.025);
    for (const u of UNITS) {
      const stats = applyTowerModifiers(unitStats(u.id, 5), all);
      expect(stats.armor).toBeLessThanOrEqual(.5); expect(stats.spawnInterval).toBeGreaterThanOrEqual(.25);
    }
    expect(applyTowerModifiers(unitStats('archer', 1), profile('force')).damage).toBe(unitStats('archer', 1).damage);
  });

  it('preserves v3 wallets, buildings, battles and pending Gold; rejects malformed v4 progress', () => {
    const s = ready(); s.gold = 88; s.tokens.Physics = 50; s.battle = createBattle(s);
    const old = JSON.parse(JSON.stringify(s)); old.version = 3; delete old.towers; old.battle.config.rulesVersion = 3; delete old.battle.config.towers;
    const migrated = parseKingdom(JSON.stringify(old));
    expect(migrated).toEqual({ ...old, version: 4, towers: emptyTowers() });
    const backfilled = { ...old, version: 1, towers: profile('force') };
    expect(parseKingdom(JSON.stringify(backfilled)).towers).toEqual(backfilled.towers);
    expect(parseKingdom(JSON.stringify(migrated))).toEqual(migrated);
    expect(() => parseKingdom(JSON.stringify({ ...migrated, towers: undefined }))).toThrow(/preserved/);
    expect(() => parseKingdom(JSON.stringify({ ...migrated, towers: { ...emptyTowers(), rule: 'future' } }))).toThrow(/preserved/);
    expect(() => parseKingdomCommand({ type: 'towers', towers: profile('force') })).toThrow();
  });

  it('freezes active snapshots and deterministic catch-up while spending does not affect earned progress', () => {
    const s = ready(); s.gold = 100; s.tokens.Physics = 100; s.castle = 2;
    s.towers = profile('force');
    const spent = applyAction(s, { type: 'building', id: 'barracks' }); expect(spent.towers).toEqual(s.towers);
    const started = applyAction(spent, { type: 'start', stage: 1 });
    const learned = reconcileLibrary(started, Array.from({ length: 15 }, (_, i) => concept(`Life ${i}`, { Life: 1 })));
    expect(learned.battle).toEqual(started.battle); expect(learned.battle).toBe(started.battle);
    const context = { state: learned, revision: 1, generation: 0, battle_clock: '2026-09-06T00:00:00Z', server_now: '2026-09-06T00:00:20Z' };
    const caught = executeKingdomCommand(context, { type: 'tick' }).state;
    let stepped = parseKingdom(JSON.stringify(learned));
    for (let i = 0; i < 80; i++) stepped = applyAction(stepped, { type: 'tick' });
    expect(caught).toEqual(stepped); expect(parseKingdom(JSON.stringify(caught))).toEqual(caught);
    expect(createBattle(learned).config.towers).toEqual(learned.towers);
  });

  it('a Force profile wins a bounded siege that an untrained profile draws', () => {
    const run = (trained: boolean) => {
      const s = ready(); if (trained) s.towers = profile('force'); s.battle = createBattle(s);
      const b = s.battle, u = b.config.slots[0]!;
      b.elapsed = 89.75; b.enemyHp = 1.01; b.nextSpawn.swordsman = 94; b.nextEnemy = 100;
      b.fighters = [{ ...u, id: 1, kind: u.id, side: 'player', x: 98, maxHp: u.hp, cooldown: 0, healingLeft: 0 }]; b.nextId = 2;
      return applyAction(s, { type: 'tick' }).battle!;
    };
    expect(run(false).result).toBe('draw'); expect(run(true).result).toBe('victory'); expect(run(true)).toEqual(run(true));
  });

  it('Computation recruitment carries fractional time across ticks instead of rounding its bonus away', () => {
    const run = (trained: boolean) => {
      const s = ready(); if (trained) s.towers = profile('cores');
      let battle = applyAction(s, { type: 'start', stage: 1 });
      for (let i = 0; i < 53; i++) battle = applyAction(battle, { type: 'tick' });
      return battle;
    };
    expect(run(false).battle!.playerSpawned).toBe(2);
    const trained = run(true);
    expect(trained.battle!.playerSpawned).toBe(3);
    expect(parseKingdom(JSON.stringify(trained))).toEqual(trained);
  });

  it('Demo backfills per account, repeated completed answers cannot farm, and reset clears all progress', async () => {
    localStorage.clear(); const owner = 'tower-demo';
    const c: Concept = { canonicalName: 'Force', definition: 'Force', aliases: ['push'], topics: { Physics: 1 }, prerequisites: [], mastery: 'proficient',
      reasoningTrack: { directInference: 1, composition: 2, discrimination: 2, transfer: 3, counterfactual: 0, synthesis: 0, derivation: 0 } };
    localStorage.setItem(`curious_y_user_concepts_${owner}`, JSON.stringify([c]));
    expect(loadKingdom(owner).towers.points.force).toBe(TOWER_SCALE); expect(loadKingdom('other').towers).toEqual(emptyTowers());
    const q = { id: 'repeat', topic: 'Physics', concept: 'push', reasoningComplexity: 'composition' as const, questionText: '?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'Force' };
    await answerDemoQuestion(owner, q, 0, [c]); await answerDemoQuestion(owner, q, 0, [c]);
    clearDemoPending(owner, q.id);
    await answerDemoQuestion(owner, { ...q, id: 'another-question-same-concept' }, 0, [c]);
    await changeKingdom(owner, { type: 'army', slots: [null, null, null, null] });
    expect(loadKingdom(owner).towers.points.force).toBe(TOWER_SCALE);
    resetDemoLearning(owner); localStorage.removeItem(`curious_y_user_concepts_${owner}`); resetKingdom(owner);
    expect(loadKingdom(owner)).toEqual(newKingdom()); await expect(answerDemoQuestion(owner, q, 0, [c])).rejects.toThrow(/reset/);
  });
});
