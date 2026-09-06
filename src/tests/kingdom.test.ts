import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, battleGoldReward, TOPICS, ARMY_LIMIT, BUILDINGS, stageLabel, Kingdom, newKingdom, parseKingdom, unitStats, defaultArmy } from '../lib/kingdom/game';
import { changeKingdom, loadKingdom, resetKingdom } from '../lib/kingdom/storage';
import { resetUserProgress } from '../services/database';
import { createInitialGameState } from '../game/economy';
import legacyBattles from './fixtures/legacy-battles.json';

function fund(s: Kingdom, answers = 1): Kingdom {
  for (let i = 0; i < answers; i++) s = applyAction(s, { type: 'answer', id: `q-${s.rewarded.length}`, topic: 'Physics', correct: true });
  // Seed balances for combat and prerequisite tests; the journey below earns them.
  return { ...s, gold: answers * 20, tokens: Object.fromEntries(TOPICS.map(topic => [topic, answers * 10])) as Kingdom['tokens'] };
}
function fight(state: Kingdom, stage: number): Kingdom {
  let s = applyAction(state, { type: 'start', stage });
  while (!s.battle!.result) {
    s = applyAction(s, { type: 'tick' });
  }
  return s;
}

describe('Phase I economy and combat', () => {
  it('unlocks new units without filling empty slots or changing the chosen army', () => {
    let state = fund(newKingdom(), 10);
    state = applyAction(state, { type: 'building', id: 'barracks' });
    expect(state.armySlots).toEqual([null, null, null, null, null]);
    state = applyAction(state, { type: 'army', slots: [null, 'militia', null, null, null] });
    state = applyAction(state, { type: 'building', id: 'range' });
    expect(state.buildings.range).toBe(1);
    expect(parseKingdom(JSON.stringify(state)).armySlots).toEqual([null, 'militia', null, null, null]);
  });

  it('migrates every ownership combination, preserves empty choices, and rejects invalid armies', () => {
    for (let mask = 0; mask < 16; mask++) {
      const state = { ...newKingdom(), castle: 3 };
      BUILDINGS.forEach((b, i) => { state.buildings[b.id] = mask & (1 << i) ? 1 : 0; });
      const legacy = { ...state, version: 1, armySlots: undefined };
      const restored = parseKingdom(JSON.stringify(legacy));
      expect(restored.armySlots).toEqual(defaultArmy(state));
      expect(parseKingdom(JSON.stringify(restored))).toEqual(restored);
      const empty = applyAction(restored, { type: 'army', slots: [null, null, null, null, null] });
      expect(parseKingdom(JSON.stringify(empty)).armySlots).toEqual([null, null, null, null, null]);
      expect(() => applyAction(empty, { type: 'start', stage: 1 })).toThrow(/at least one/);
    }
    const state = { ...newKingdom(), castle: 5 }; // Castle alone does not unlock units.
    expect(() => applyAction(state, { type: 'army', slots: ['scout-rider', null, null, null, null] })).toThrow(/ineligible/);
    state.buildings.barracks = 1;
    for (const slots of [['militia', 'militia', null, null, null], ['militia'], ['unknown', null, null, null]]) {
      expect(() => applyAction(state, { type: 'army', slots } as never)).toThrow();
    }
    expect(() => parseKingdom(JSON.stringify({ ...state, armySlots: undefined }))).toThrow();
  });

  it('spawns only selected units and freezes upgrades, stats and choices until retreat/retry', () => {
    let state = { ...newKingdom(), castle: 3, buildings: { ...newKingdom().buildings, barracks: 1, range: 1, stable: 1, workshop: 1 } };
    state = applyAction(state, { type: 'army', slots: [null, 'ballista', 'slinger', null, null] });
    const started = applyAction(state, { type: 'start', stage: 1 });
    expect(started.battle!.fighters).toEqual([]);
    expect(started.battle!.config.slots.map(u => u?.id ?? null)).toEqual([null, 'ballista', 'slinger', null, null]);
    expect(() => applyAction(started, { type: 'army', slots: [null, null, null, null, null] })).toThrow(/battle/);
    const changedOwnership = structuredClone(started);
    changedOwnership.buildings.workshop = 3;
    // Simulation consumes the snapshot, never live ownership or mutable definitions.
    let frozen = started;
    let altered = changedOwnership;
    for (let i = 0; i < 60; i++) {
      frozen = applyAction(frozen, { type: 'tick' });
      altered = applyAction(altered, { type: 'tick' });
    }
    expect(altered.battle).toEqual(frozen.battle);
    const retreated = applyAction(frozen, { type: 'retreat' });
    const prepared = applyAction(retreated, { type: 'army', slots: ['militia', null, null, null, null] });
    const retry = applyAction(prepared, { type: 'start', stage: 1 });
    expect(retry.battle!.elapsed).toBe(0);
    expect(retry.battle!.fighters).toEqual([]);
    expect(retry.battle!.nextSpawn).toEqual({ militia: 4.5 });
    expect(retry.gold).toBe(0);
  });

  it('gives all overdue slots a turn as field space opens, without banking a burst', () => {
    const ready = { ...newKingdom(), castle: 3, buildings: { ...newKingdom().buildings, barracks: 1, range: 1, stable: 1, workshop: 1, academy: 1 } };
    ready.armySlots = defaultArmy(ready);
    ready.armySlots[4] = 'medic';
    let state = applyAction(ready, { type: 'start', stage: 1 });
    const b = state.battle!;
    b.fighters = Array.from({ length: ARMY_LIMIT }, (_, i) => ({ ...unitStats('militia', 1), kind: 'militia', side: 'player', x: 5, maxHp: 65, id: i + 1 }));
    b.nextId = ARMY_LIMIT + 1;
    b.nextSpawn = { militia: 0, slinger: 0, 'scout-rider': 0, ballista: 0, medic: 0 };
    for (const expected of ready.armySlots.filter(id => id !== null)) {
      state = applyAction(state, { type: 'tick' });
      expect(state.battle!.fighters).toHaveLength(ARMY_LIMIT);
      state.battle!.fighters.shift();
      state = applyAction(state, { type: 'tick' });
      expect(state.battle!.fighters.at(-1)!.kind).toBe(expected);
      expect(state.battle!.fighters).toHaveLength(ARMY_LIMIT);
    }
  });

  it.each([
    [1, 1, [1, 0, 0, 0], 72.5, 'victory'],
    [11, 2, [1, 1, 0, 0], 143.75, 'victory'],
    [21, 3, [1, 1, 1, 1], 92.5, 'defeat'],
    [31, 3, [2, 2, 1, 1], 64.75, 'defeat'],
    [41, 5, [3, 3, 3, 3], 88, 'defeat'],
    [81, 1, [1, 0, 0, 0], 44.75, 'defeat'],
    [41, 5, [5, 0, 0, 0], 72.5, 'defeat'],
  ] as const)('measures reproducible stage %s fights (castle %s)', (stage, castle, levels, seconds, result) => {
    const state = { ...newKingdom(), castle, cleared: stage - 1 };
    BUILDINGS.slice(0, 4).forEach((b, i) => { state.buildings[b.id] = levels[i]; });
    state.armySlots = defaultArmy(state);
    const first = fight(state, stage);
    expect(first.battle!.elapsed).toBe(seconds);
    expect(first.battle!.result).toBe(result);
    expect(fight(parseKingdom(JSON.stringify(state)), stage)).toEqual(first);
    expect(first.battle!.config.maxSeconds).toBe(450);
  });

  it('resolves castle destruction on the final tick before timeout and pays victory once', () => {
    let state = applyAction({ ...newKingdom(), armySlots: ['militia', null, null, null, null], buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
    for (let i = 0; i < 18; i++) state = applyAction(state, { type: 'tick' });
    state.battle!.elapsed = state.battle!.config.maxSeconds - state.battle!.config.stepSeconds;
    state.battle!.fighters[0].x = 99;
    state.battle!.enemyHp = 1;
    state.battle!.nextEnemy = state.battle!.config.maxSeconds;
    state = applyAction(state, { type: 'tick' });
    expect(state.battle!.result).toBe('victory');
    expect(state.battle!.elapsed).toBe(450);
    expect(state.gold).toBe(0);
    state = applyAction(state, { type: 'collect-battle', stage: 1 });
    expect(state.gold).toBe(60);
    expect(applyAction(parseKingdom(JSON.stringify(state)), { type: 'tick' })).toEqual(state);
  });
  it('spawns each equipped unit on its own timer and preserves those timers across reloads', () => {
    const ready = { ...newKingdom(), castle: 3, armySlots: ['militia', 'slinger', 'scout-rider', 'ballista', null] as const as ['militia', 'slinger', 'scout-rider', 'ballista', null], buildings: { ...newKingdom().buildings, barracks: 2, range: 1, stable: 3, workshop: 1 } };
    let s = applyAction(ready, { type: 'start', stage: 1 });
    expect(s.battle!.fighters).toEqual([]);
    expect(s.battle!.playerSpawned).toBe(0);
    expect(s.battle!.nextSpawn).toEqual({ militia: 4.5, slinger: 6, 'scout-rider': 9, ballista: 12 });
    for (let i = 1; i <= 48; i++) {
      // Reload throughout the initial wait and every later recruitment cycle.
      s = applyAction(parseKingdom(JSON.stringify(s)), { type: 'tick' });
      const elapsed = i * .25;
      for (const [kind, interval] of [['militia', 4.5], ['slinger', 6], ['scout-rider', 9], ['ballista', 12]] as const) {
        expect(s.battle!.fighters.filter(f => f.side === 'player' && f.kind === kind)).toHaveLength(Math.floor(elapsed / interval));
      }
    }
    expect(s.battle!.fighters.find(f => f.kind === 'militia')!.maxHp).toBe(unitStats('militia', 2).hp);
    expect(s.battle!.fighters.find(f => f.kind === 'scout-rider')!.damage).toBe(unitStats('scout-rider', 3).damage);
    for (const [kind, count] of [['militia', 2], ['slinger', 2], ['scout-rider', 1], ['ballista', 1]] as const) {
      expect(s.battle!.fighters.filter(f => f.side === 'player' && f.kind === kind)).toHaveLength(count);
    }
    expect(s.battle).not.toHaveProperty('supply');
    expect(applyAction(parseKingdom(JSON.stringify(s)), { type: 'tick' })).toEqual(applyAction(s, { type: 'tick' }));
    let solo = applyAction({ ...newKingdom(), armySlots: ['militia', null, null, null, null] as ['militia', null, null, null, null], buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
    for (let i = 0; i < 48; i++) solo = applyAction(solo, { type: 'tick' });
    expect(solo.battle!.fighters.filter(f => f.side === 'player')).toHaveLength(2);
  });

  it('holds recruitment at the field limit and resumes when a space opens', () => {
    let s = applyAction({ ...newKingdom(), armySlots: ['militia', null, null, null, null] as ['militia', null, null, null, null], buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
    const template = { ...unitStats('militia', 1), kind: 'militia' as const, side: 'player' as const, x: 5, maxHp: 65 };
    s.battle!.fighters = Array.from({ length: ARMY_LIMIT }, (_, i) => ({ ...template, id: i + 1 }));
    s.battle!.nextId = ARMY_LIMIT + 1;
    s.battle!.nextSpawn.militia = 0;
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.fighters).toHaveLength(ARMY_LIMIT);
    expect(s.battle!.nextSpawn.militia).toBe(0);
    s.battle!.fighters.pop();
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.fighters).toHaveLength(ARMY_LIMIT);
    expect(s.battle!.nextSpawn.militia).toBe(5);
    expect(s.battle!.fighters.at(-1)!.id).toBe(ARMY_LIMIT + 1);
  });

  it('takes a fresh player from a resource reward to a building, a victory and Gold', () => {
    const initial = newKingdom();
    let s = applyAction(initial, { type: 'answer', id: 'answer-1', topic: 'Physics', correct: true });
    expect(initial.tokens.Physics).toBe(0);
    expect(s.tokens.Physics).toBe(10);
    expect(applyAction(s, { type: 'answer', id: 'answer-1', topic: 'Physics', correct: true })).toEqual(s);
    expect(s.gold).toBe(0);
    s = applyAction(s, { type: 'building', id: 'barracks' });
    s = applyAction(s, { type: 'army', slots: ['militia', null, null, null, null] });
    expect(s.gold).toBe(0);
    const result = fight(s, 1);
    expect(result.battle!.result).toBe('victory');
    expect(result.cleared).toBe(1);
    expect(result.gold).toBe(0);
    expect(applyAction(result, { type: 'collect-battle', stage: 1 }).gold).toBe(battleGoldReward(1));
    expect(result.tokens.Physics).toBe(0);
    expect(applyAction(parseKingdom(JSON.stringify(result)), { type: 'tick' }).gold).toBe(result.gold);
    expect(applyAction(result, { type: 'tick' })).toEqual(result);
    expect(parseKingdom(JSON.stringify(result))).toEqual(result);
  });

  it('rewards attempts once and keeps topic balances separate', () => {
    let s = applyAction(newKingdom(), { type: 'answer', id: 'wrong', topic: 'Chemistry', correct: false });
    s = applyAction(s, { type: 'answer', id: 'right', topic: 'Life', correct: true });
    expect(s.tokens.Chemistry).toBe(3);
    expect(s.tokens.Life).toBe(10);
    expect(s.gold).toBe(0);
    expect(() => applyAction(s, { type: 'exchange', topic: 'Chemistry' } as never)).toThrow(/Unsupported/);
    expect(() => applyAction(s, { type: 'answer', id: 'bad', topic: 'Not a topic', correct: true })).toThrow();
  });

  it('uses learning resources to upgrade the Castle while preserving battle Gold', () => {
    let state = applyAction(newKingdom(), { type: 'answer', id: 'force', topic: 'Physics', correct: true });
    state = applyAction(state, { type: 'building', id: 'barracks' });
    state = applyAction(state, { type: 'army', slots: ['militia', null, null, null, null] });
    state = fight(state, 1);
    state = applyAction(state, { type: 'collect-battle', stage: 1 });
    expect(state.gold).toBe(60);
    expect(() => applyAction(state, { type: 'castle' })).toThrow(/Runes.*Influence/);
    for (const topic of ['Mathematics & Logic', 'Society & History']) {
      state = applyAction(state, { type: 'answer', id: topic, topic, correct: true });
    }
    const upgraded = applyAction(state, { type: 'castle' });
    expect(upgraded.castle).toBe(2);
    expect(upgraded.gold).toBe(state.gold);
    expect(upgraded.tokens['Mathematics & Logic']).toBe(0);
    expect(upgraded.tokens['Society & History']).toBe(0);
    expect(state.gold).toBe(60);
  });

  it.each([
    ['barracks', ['Physics'], 20],
    ['range', ['Earth & Space', 'Mind & Behavior'], 30],
    ['stable', ['Life', 'Chemistry'], 40],
    ['workshop', ['Computer Science', 'Physics'], 60],
  ] as const)('requires and spends the specific resources for a %s upgrade', (id, topics, amount) => {
    const state = { ...newKingdom(), castle: 3, gold: 20 };
    state.buildings[id] = 1;
    for (const topic of TOPICS) state.tokens[topic] = 100;
    for (const topic of topics) state.tokens[topic] = amount;
    for (const topic of topics) {
      const short = structuredClone(state);
      short.tokens[topic]--;
      expect(() => applyAction(short, { type: 'building', id })).toThrow(/more/);
      expect(short.buildings[id]).toBe(1);
      expect(short.gold).toBe(20);
    }
    expect(applyAction({ ...state, gold: 0 }, { type: 'building', id }).gold).toBe(0);
    const upgraded = applyAction(state, { type: 'building', id });
    expect(upgraded.gold).toBe(state.gold);
    expect(upgraded.buildings[id]).toBe(2);
    for (const topic of TOPICS) {
      expect(upgraded.tokens[topic]).toBe((topics as readonly string[]).includes(topic) ? 0 : 100);
    }
  });

  it('enforces costs, castle prerequisites, building caps and sequential battle progression', () => {
    let s = newKingdom();
    expect(() => applyAction(s, { type: 'castle' })).toThrow(/Runes.*Influence/);
    expect(() => applyAction(s, { type: 'building', id: 'barracks' })).toThrow(/Force/);
    expect(() => applyAction(s, { type: 'start', stage: 1 })).toThrow(/building/);
    s = fund(s, 20);
    expect(() => applyAction(s, { type: 'building', id: 'stable' })).toThrow(/Keep \(Castle\) level 2/);
    s = applyAction(s, { type: 'building', id: 'barracks' });
    s = applyAction(s, { type: 'army', slots: ['militia', null, null, null, null] });
    expect(() => applyAction(s, { type: 'building', id: 'barracks' })).toThrow(/Castle/);
    expect(() => applyAction(s, { type: 'start', stage: 2 })).toThrow(/previous/);
    expect(() => applyAction(s, { type: 'start', stage: NaN })).toThrow();
    s = applyAction(s, { type: 'start', stage: 1 });
    expect(() => applyAction(s, { type: 'castle' })).toThrow(/battle/);
    expect(() => applyAction(s, { type: 'building', id: 'range' })).toThrow(/battle/);
    expect(s.battle!.fighters).toEqual([]);
    expect(s.battle!.nextSpawn.militia).toBe(4.5);
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.fighters).toHaveLength(0);
  });

  it('can unlock and improve all four units through learning and advance through chapter boundaries', () => {
    let s = fund(newKingdom(), 180);
    for (let i = 1; i < 5; i++) s = applyAction(s, { type: 'castle' });
    for (const building of BUILDINGS) {
      for (let i = 0; i < 5; i++) s = applyAction(s, { type: 'building', id: building.id });
      expect(unitStats(building.unitId, 5).hp).toBeGreaterThan(unitStats(building.unitId, 1).hp);
      if (building.unitId === 'medic') expect(unitStats('medic', 5).healBudget).toBeGreaterThan(unitStats('medic', 1).healBudget!);
      else expect(unitStats(building.unitId, 5).damage).toBeGreaterThan(unitStats(building.unitId, 1).damage);
    }
    expect(() => applyAction(s, { type: 'castle' })).toThrow(/maximum/);
    s = applyAction(s, { type: 'army', slots: defaultArmy(s) });
    for (let stage = 1; stage <= 11; stage++) {
      s = fight(s, stage);
      expect(s.battle!.result, `stage ${stage}`).toBe('victory');
      expect(s.cleared).toBe(stage);
      s = applyAction(s, { type: 'collect-battle', stage });
    }
    expect([1, 9, 10, 11, 20, 21].map(stageLabel)).toEqual(['1-1', '1-9', '1-10', '2-1', '2-10', '3-1']);
    expect(() => fight(s, 1)).toThrow(/next unbeaten/);
    expect(() => fight(s, 13)).toThrow(/previous/);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
  });

  it('handles defeat, retreat, timeout and retries without consuming permanent progress', () => {
    let ready = applyAction(fund(newKingdom()), { type: 'building', id: 'barracks' });
    ready = applyAction(ready, { type: 'army', slots: ['militia', null, null, null, null] });
    let s = applyAction({ ...ready, cleared: 80 }, { type: 'start', stage: 81 });
    for (let i = 0; i < 480 && !s.battle!.result; i++) s = applyAction(s, { type: 'tick' });
    expect(s.battle!.result).toBe('defeat');
    expect(s.cleared).toBe(80);
    expect(s.buildings).toEqual(ready.buildings);
    s = applyAction(s, { type: 'start', stage: 81 });
    expect(s.battle!.nextSpawn.militia).toBe(4.5);
    expect(s.battle!.playerHp).toBe(240);
    s.battle!.elapsed = s.battle!.config.maxSeconds - s.battle!.config.stepSeconds;
    s.battle!.nextEnemy = s.battle!.config.maxSeconds;
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.result).toBe('draw');
    s = applyAction(s, { type: 'start', stage: 81 });
    s = applyAction(s, { type: 'retreat' });
    expect(s.battle!.result).toBe('defeat');
    expect(s.gold).toBe(ready.gold);
  });

  it('makes upgrades change the outcome against the second chapter army', () => {
    let weak = applyAction(fund(newKingdom(), 180), { type: 'building', id: 'barracks' });
    weak = applyAction(weak, { type: 'army', slots: defaultArmy(weak) });
    weak.cleared = 10;
    const weakResult = fight(weak, 11);
    expect(weakResult.battle!.result).not.toBe('victory');
    for (let i = 1; i < 5; i++) weak = applyAction(weak, { type: 'castle' });
    for (let i = 1; i < 5; i++) weak = applyAction(weak, { type: 'building', id: 'barracks' });
    for (const id of ['range', 'stable', 'workshop'] as const) for (let i = 0; i < 3; i++) weak = applyAction(weak, { type: 'building', id });
    weak = applyAction(weak, { type: 'army', slots: defaultArmy(weak) });
    expect(fight(weak, 11).battle!.result).toBe('victory');
  });

  it('applies simultaneous castle damage as a draw and stops advancing completed battles', () => {
    let s = applyAction(fund(newKingdom()), { type: 'building', id: 'barracks' });
    s = applyAction(s, { type: 'army', slots: defaultArmy(s) });
    s = applyAction(s, { type: 'start', stage: 1 });
    s.battle!.playerHp = 1; s.battle!.enemyHp = 1;
    s.battle!.nextId = 3;
    s.battle!.fighters = [
      { ...unitStats('militia', 1), attackCount: 0, id: 1, kind: 'militia', side: 'player', x: 99, hp: 65, maxHp: 65, damage: 12, range: 3, speed: 7, castleMultiplier: 1 },
      { ...unitStats('militia', 1), attackCount: 0, id: 2, kind: 'militia', side: 'enemy', x: 1, hp: 65, maxHp: 65, damage: 12, range: 3, speed: 7, castleMultiplier: 1 },
    ];
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.result).toBe('draw');
    expect(s.gold).toBe(20);
    expect(applyAction(s, { type: 'tick' })).toEqual(s);
  });
});

describe('Castle persistence', () => {
  it('persists pending battle Gold, blocks the next stage, and retries collection exactly once', async () => {
    const ready = { ...newKingdom(), buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } };
    ready.armySlots = defaultArmy(ready);
    const won = fight(ready, 1);
    localStorage.setItem('curious_y_phase1_v1_alice', JSON.stringify(won));
    expect(loadKingdom('alice').gold).toBe(0);
    expect(loadKingdom('alice').battle!.rewardCollected).toBe(false);
    await expect(changeKingdom('alice', { type: 'start', stage: 2 })).rejects.toThrow(/Collect/);
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(changeKingdom('alice', { type: 'collect-battle', stage: 1 })).rejects.toThrow(/has not been applied/);
    fail.mockRestore();
    expect(loadKingdom('alice')).toEqual(won);
    await changeKingdom('alice', { type: 'collect-battle', stage: 1 });
    await changeKingdom('alice', { type: 'collect-battle', stage: 1 });
    expect(loadKingdom('alice').gold).toBe(60);
    expect(loadKingdom('alice').battle!.rewardCollected).toBe(true);
    await changeKingdom('alice', { type: 'start', stage: 2 });
    await expect(changeKingdom('alice', { type: 'collect-battle', stage: 1 })).rejects.toThrow(/no reward/);
    expect(loadKingdom('alice').gold).toBe(60);
  });

  it('treats historical victories as already collected without paying again', () => {
    const ready = { ...newKingdom(), buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } };
    ready.armySlots = defaultArmy(ready);
    const historical = JSON.parse(JSON.stringify(fight(ready, 1)).replace(/militia/g,'swordsman'));
    historical.version = 2;
    historical.armySlots = historical.armySlots.slice(0, 4);
    historical.battle.config.slots = historical.battle.config.slots.slice(0, 4);
    historical.battle.config.rulesVersion = 2;
    historical.battle.config.maxSeconds = 90;
    delete historical.battle.config.reward;
    delete historical.battle.paidGold;
    delete historical.battle.rewardCollected;
    historical.gold = 60;
    const restored = parseKingdom(JSON.stringify(historical));
    expect(restored.battle!.rewardCollected).toBe(true);
    expect(applyAction(restored, { type: 'collect-battle', stage: 1 }).gold).toBe(60);
    expect(applyAction(restored, { type: 'start', stage: 2 }).battle!.stage).toBe(2);
    historical.battle.rewardCollected = 'false';
    expect(() => parseKingdom(JSON.stringify(historical))).toThrow(/preserved/);
  });

  it('finishes captured pre-step-2 saves identically to the original simulator', () => {
    for (const fixture of legacyBattles) {
      let state = parseKingdom(JSON.stringify(fixture.saved));
      while (!state.battle!.result) state = applyAction(state, { type: 'tick' });
      if (state.battle!.result === 'victory') state = applyAction(state, { type: 'collect-battle', stage: state.battle!.stage });
      expect(state).toEqual(parseKingdom(JSON.stringify(fixture.expected)));
    }
  });

  it('rejects damaged rules, slot snapshots and timers without replacing saves', () => {
    const state = parseKingdom(JSON.stringify(legacyBattles[0].saved));
    for (const mutate of [
      (s: Kingdom) => { s.battle!.config.rulesVersion = 99 as never; },
      (s: Kingdom) => { s.battle!.config.maxSeconds = 90; },
      (s: Kingdom) => { s.battle!.config.slots[1] = s.battle!.config.slots[0]; },
      (s: Kingdom) => { s.battle!.config.slots[0]!.damage = -1; },
      (s: Kingdom) => { delete s.battle!.nextSpawn.swordsman; },
      (s: Kingdom) => { s.battle!.elapsed = 120.25; },
    ]) {
      const broken = structuredClone(state); mutate(broken);
      const raw = JSON.stringify(broken);
      localStorage.setItem('curious_y_phase1_v1_damaged', raw);
      expect(() => loadKingdom('damaged')).toThrow(/preserved/);
      expect(localStorage.getItem('curious_y_phase1_v1_damaged')).toBe(raw);
    }
  });
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it('migrates supply-era saves without losing fighters or campaign progress', () => {
    let state = applyAction({ ...newKingdom(), cleared: 5, armySlots: ['militia', null, null, null, null] as ['militia', null, null, null, null], buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 6 });
    state.battle!.nextEnemy = 9; // Supply-era fixture has no new roster enemies.
    for (let i = 0; i < 18; i++) state = applyAction(state, { type: 'tick' });
    const legacy = JSON.parse(JSON.stringify(state));
    legacy.version = 1;
    delete legacy.armySlots;
    delete legacy.battle.config;
    legacy.battle.fighters.forEach((f: { kind: string; castleMultiplier?: number }) => { f.kind = 'barracks'; delete f.castleMultiplier; });
    delete legacy.battle.playerSpawned;
    delete legacy.battle.nextSpawn;
    legacy.battle.supply = 10;
    const restored = parseKingdom(JSON.stringify(legacy));
    expect(restored.cleared).toBe(5);
    expect(restored.battle!.fighters).toEqual(state.battle!.fighters.map(f=>({...f,kind:'swordsman'})));
    expect(restored.battle!.config.maxSeconds).toBe(120);
    expect(restored.battle).not.toHaveProperty('supply');
    let advanced = restored;
    for (let i = 0; i < 6; i++) advanced = applyAction(advanced, { type: 'tick' });
    expect(advanced.battle!.fighters.filter(f => f.side === 'player')).toHaveLength(2);
    expect(() => parseKingdom(JSON.stringify({ ...state, battle: { ...state.battle, nextSpawn: { ...state.battle!.nextSpawn, barracks: -1 } } }))).toThrow();
  });
  it('migrates the incoming preview balances without overwriting its source save', async () => {
    const legacy = { ...createInitialGameState(), gold: 123, castleLevel: 3 };
    legacy.knowledge.force = 17;
    legacy.knowledge.runes = 8;
    const raw = JSON.stringify(legacy);
    localStorage.setItem('curious_y_kingdom_v1_alice', raw);
    expect(loadKingdom('alice')).toMatchObject({ gold: 123, castle: 3, tokens: { Physics: 17, 'Mathematics & Logic': 8 } });
    await changeKingdom('alice', { type: 'building', id: 'barracks' });
    expect(loadKingdom('alice').gold).toBe(123);
    expect(localStorage.getItem('curious_y_kingdom_v1_alice')).toBe(raw);
    expect(localStorage.getItem('curious_y_phase1_v1_alice')).not.toBeNull();
    // A second load must not re-import already spent currencies.
    expect(loadKingdom('alice').tokens.Physics).toBe(7);
    resetKingdom('alice');
    expect(loadKingdom('alice')).toEqual(newKingdom());
    expect(localStorage.getItem('curious_y_kingdom_v1_alice')).toBeNull();
  });

  it('preserves prior Phase I saves, including battle positions and reward IDs', async () => {
    let state = applyAction(fund(newKingdom()), { type: 'building', id: 'barracks' });
    state = applyAction(state, { type: 'army', slots: ['militia', null, null, null, null] });
    state = applyAction(state, { type: 'start', stage: 1 });
    const raw = JSON.stringify(state);
    localStorage.setItem('curious_y_kingdom_v1_alice', raw);
    expect(loadKingdom('alice')).toEqual(state);
    await changeKingdom('alice', { type: 'answer', id: state.rewarded[0], topic: 'Physics', correct: true });
    expect(loadKingdom('alice')).toEqual(state);
    expect(localStorage.getItem('curious_y_kingdom_v1_alice')).toBe(raw);
  });
  it('persists transactions and battle positions, deduplicates rewards after reload and isolates accounts', async () => {
    const answer = { type: 'answer', id: 'q', topic: 'Physics', correct: true } as const;
    await changeKingdom('alice', answer);
    await changeKingdom('alice', answer);
    expect(loadKingdom('alice').tokens.Physics).toBe(10);
    expect(loadKingdom('bob')).toEqual(newKingdom());
    await changeKingdom('alice', { type: 'building', id: 'barracks' });
    await changeKingdom('alice', { type: 'army', slots: ['militia', null, null, null, null] });
    await changeKingdom('alice', { type: 'start', stage: 1 });
    for (let i = 0; i < 17; i++) await changeKingdom('alice', { type: 'tick' });
    const saved = await changeKingdom('alice', { type: 'tick' });
    expect(loadKingdom('alice')).toEqual(saved);
    expect(saved.battle!.fighters[0].x).toBeGreaterThan(5);
    await changeKingdom('bob', answer);
    await resetUserProgress('alice');
    expect(loadKingdom('alice')).toEqual(newKingdom());
    expect(loadKingdom('bob').tokens.Physics).toBe(10);
  });
  it('preserves the prior save on storage failure and safely retries a reward', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(changeKingdom('alice', { type: 'answer', id: 'q', topic: 'Physics', correct: true })).rejects.toThrow(/has not been applied/);
    expect(loadKingdom('alice')).toEqual(newKingdom());
    spy.mockRestore();
    await changeKingdom('alice', { type: 'answer', id: 'q', topic: 'Physics', correct: true });
    expect(loadKingdom('alice').tokens.Physics).toBe(10);
  });
  it('surfaces corrupted saves without overwriting them and allows explicit reset', async () => {
    localStorage.setItem('curious_y_kingdom_v1_alice', '{broken');
    expect(() => loadKingdom('alice')).toThrow();
    await expect(changeKingdom('alice', { type: 'castle' })).rejects.toThrow();
    expect(localStorage.getItem('curious_y_kingdom_v1_alice')).toBe('{broken');
    resetKingdom('alice');
    expect(loadKingdom('alice')).toEqual(newKingdom());
    expect(() => parseKingdom(JSON.stringify({ ...newKingdom(), gold: -1 }))).toThrow();
    expect(() => parseKingdom(JSON.stringify({ ...newKingdom(), battle: {} }))).toThrow();
  });
});
