import { describe, expect, it } from 'vitest';
import { applyAction, battleSeconds, battleSpeed, buildingCost, castleCost, createBattle, newKingdom, parseKingdom, reconcileUnits, TOPICS, UNITS, unitUpgradeStatus, type ArmySlots, type Kingdom } from '../lib/kingdom/game';
import { executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { motionX, visualUnits } from '../lib/kingdom/battleAnimation';
import legacy from './fixtures/rules5-battle-balance.json';

function army(keep: number, tier: number, slots: ArmySlots): Kingdom {
  const s = newKingdom(); s.castle = keep;
  for (const id of slots) if (id) s.buildings[UNITS.find(u => u.id === id)!.building] = tier;
  s.armySlots = slots;
  return reconcileUnits(s);
}
function fight(state: Kingdom, stage: number) {
  let s = applyAction({ ...state, cleared: stage - 1 }, { type: 'start', stage });
  while (!s.battle!.result) s = applyAction(s, { type: 'tick' });
  return s.battle!;
}

describe('Battle balance and learning progression', () => {
  it('wins 1-1 with the first Barracks; 1-2 needs reinforcements', () => {
    const starter = army(1, 1, ['swordsman', null, null, null]);
    expect(fight(starter, 1).result).toBe('victory');
    expect(fight(starter, 2).result).not.toBe('victory');
    const reinforced = army(1, 1, ['swordsman', 'archer', null, null]);
    expect(fight(reinforced, 2).result).toBe('victory');
    expect(fight(reinforced, 3).result).toBe('victory');
    expect(fight(reinforced, 4).result).not.toBe('victory');
  });

  it('requires another investment after the first chapter, with a screened siege army', () => {
    const firstChapter = army(2, 2, ['swordsman', 'archer', 'knight', 'medic']);
    for (let stage = 1; stage <= 10; stage++) expect(fight(firstChapter, stage).result).toBe('victory');
    expect(fight(firstChapter, 11).result).not.toBe('victory');
    const upgraded = army(3, 3, ['swordsman', 'archer', 'knight', 'catapult']);
    for (const p of Object.values(upgraded.units)) p!.level = 2;
    expect(fight(upgraded, 11).result).toBe('victory');
    const boss = createBattle(firstChapter, 10), next = createBattle(firstChapter, 11);
    expect(next.enemyMaxHp - boss.enemyMaxHp).toBeGreaterThan(createBattle(firstChapter, 9).enemyMaxHp - createBattle(firstChapter, 8).enemyMaxHp);
    expect(next.config.enemy.units.map(u => u.id)).toEqual(['shieldbearer', 'crossbowman', 'knight', 'catapult']);
    expect(next.config.enemy.units[0].hp).toBeGreaterThan(createBattle(firstChapter, 9).config.enemy.units[0].hp);
  });

  it('can buy every combat building tier and unit upgrade with questions and zero Gold', () => {
    let s = newKingdom();
    const earn = (cost: ReturnType<typeof castleCost>) => {
      expect(cost.gold).toBe(0);
      for (const topic of TOPICS) while (s.tokens[topic] < (cost.resources[topic] ?? 0)) {
        s = applyAction(s, { type: 'answer', id: `learning-${s.rewarded.length}`, topic, correct: true });
      }
    };
    for (let level = 1; level < 5; level++) { earn(castleCost(level)); s = applyAction(s, { type: 'castle' }); }
    for (const id of ['barracks', 'range', 'stable', 'workshop', 'academy'] as const) {
      for (let level = 0; level < 5; level++) { earn(buildingCost(id, level)); s = applyAction(s, { type: 'building', id }); }
    }
    s.cleared = 10; // Promotion milestones remain campaign achievements.
    for (const id of ['swordsman', 'archer', 'knight', 'catapult', 'medic'] as const) {
      for (const type of ['unit-level', 'unit-star'] as const) {
        const key = type === 'unit-level' ? 'level' : 'stars', cap = key === 'level' ? 5 : 3;
        while (s.units[id]![key] < cap) {
          earn(unitUpgradeStatus(s, id, type).cost);
          s = applyAction(s, { type, id, expected: s.units[id]![key] });
        }
      }
    }
    expect(s.gold).toBe(0);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    expect(buildingCost('treasury', 1).gold).toBe(20);
  });

  it('runs at fivefold wall speed, with matching visual movement and drift-free polling', () => {
    const state = applyAction(army(1, 1, ['swordsman', null, null, null]), { type: 'start', stage: 1 });
    const base = { state, revision: 0, generation: 0, battle_clock: '2026-09-06T00:00:00Z', server_now: '2026-09-06T00:00:00Z' };
    let split = base;
    for (const ms of [63, 127, 189, 251, 999, 1013, 2031, 4999, 10000]) {
      const now = new Date(Date.parse(base.server_now) + ms).toISOString();
      const next = executeKingdomCommand({ ...split, server_now: now }, { type: 'tick' });
      split = { ...split, state: next.state, battle_clock: next.battleClock!, server_now: now };
    }
    expect(split.state).toEqual(executeKingdomCommand({ ...base, server_now: split.server_now }, { type: 'tick' }).state);
    expect(split.state.battle!.elapsed).toBe(50);
    expect(battleSpeed(6)).toBe(5); expect(battleSpeed(5)).toBe(1);
    const spec = state.battle!.config.slots[0]!;
    expect(battleSeconds(state.battle!, (95 - spec.range) / spec.speed)).toBeLessThan(10);
    const spawned = applyAction(state, { type: 'tick' });
    spawned.battle!.fighters = [{ ...spec, kind: spec.id, id: 1, x: 5, side: 'player', maxHp: spec.hp }];
    const visual = visualUnits(spawned.battle!, [], 0)[0];
    expect(motionX(visual, .5) - 5).toBeCloseTo(spec.speed * 5 * .5);
  });

  it('continues rules-5 snapshots exactly as the previous engine, including rewards', () => {
    for (const { saved, expected } of legacy) {
      let s = parseKingdom(JSON.stringify(saved));
      while (!s.battle!.result) s = applyAction(s, { type: 'tick' });
      expect(s.battle).toEqual(expected);
      expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    }
  });
});
