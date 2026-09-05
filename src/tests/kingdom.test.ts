import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, battleGoldReward, TOPICS, ARMY_LIMIT, BUILDINGS, stageLabel, Kingdom, newKingdom, parseKingdom, unitStats } from '../lib/kingdom/game';
import { changeKingdom, loadKingdom, resetKingdom } from '../lib/kingdom/storage';
import { resetUserProgress } from '../services/database';
import { createInitialGameState } from '../game/economy';

function fund(s: Kingdom, answers = 1): Kingdom {
  for (let i = 0; i < answers; i++) s = applyAction(s, { type: 'answer', id: `q-${s.rewarded.length}`, topic: 'Physics', correct: true });
  // Seed balances for combat and prerequisite tests; the journey below earns them.
  return { ...s, gold: answers * 20, tokens: Object.fromEntries(TOPICS.map(topic => [topic, answers * 10])) as Kingdom['tokens'] };
}
function fight(state: Kingdom, stage: number): Kingdom {
  let s = applyAction(state, { type: 'start', stage });
  for (let i = 0; i < 480 && !s.battle!.result; i++) {
    s = applyAction(s, { type: 'tick' });
  }
  return s;
}

describe('Phase I economy and combat', () => {
  it('spawns each built unit on its own timer and preserves those timers across reloads', () => {
    const ready = { ...newKingdom(), castle: 3, buildings: { barracks: 2, range: 1, stable: 3, workshop: 1 } };
    let s = applyAction(ready, { type: 'start', stage: 1 });
    expect(s.battle!.fighters.map(f => f.kind)).toEqual(['barracks', 'range', 'stable', 'workshop']);
    expect(s.battle!.fighters[0].maxHp).toBe(unitStats('barracks', 2).hp);
    expect(s.battle!.fighters[2].damage).toBe(unitStats('stable', 3).damage);
    for (let i = 0; i < 16; i++) s = applyAction(s, { type: 'tick' });
    for (const [kind, count] of [['barracks', 3], ['range', 3], ['stable', 2], ['workshop', 2]] as const) {
      expect(s.battle!.fighters.filter(f => f.side === 'player' && f.kind === kind)).toHaveLength(count);
    }
    expect(s.battle).not.toHaveProperty('supply');
    expect(applyAction(parseKingdom(JSON.stringify(s)), { type: 'tick' })).toEqual(applyAction(s, { type: 'tick' }));
    let solo = applyAction({ ...newKingdom(), buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
    for (let i = 0; i < 16; i++) solo = applyAction(solo, { type: 'tick' });
    expect(solo.battle!.fighters.filter(f => f.side === 'player')).toHaveLength(3);
  });

  it('holds recruitment at the field limit and resumes when a space opens', () => {
    let s = applyAction({ ...newKingdom(), buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
    const template = s.battle!.fighters[0];
    s.battle!.fighters = Array.from({ length: ARMY_LIMIT }, (_, i) => ({ ...template, id: i + 1 }));
    s.battle!.nextId = ARMY_LIMIT + 1;
    s.battle!.nextSpawn.barracks = 0;
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.fighters).toHaveLength(ARMY_LIMIT);
    expect(s.battle!.nextSpawn.barracks).toBe(0);
    s.battle!.fighters.pop();
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.fighters).toHaveLength(ARMY_LIMIT);
    expect(s.battle!.nextSpawn.barracks).toBe(2);
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
    expect(s.gold).toBe(0);
    const result = fight(s, 1);
    expect(result.battle!.result).toBe('victory');
    expect(result.cleared).toBe(1);
    expect(result.gold).toBe(battleGoldReward(1));
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

  it('uses battle Gold and the required learning resources to upgrade the Castle', () => {
    let state = applyAction(newKingdom(), { type: 'answer', id: 'force', topic: 'Physics', correct: true });
    state = applyAction(state, { type: 'building', id: 'barracks' });
    state = fight(state, 1);
    expect(state.gold).toBe(60);
    expect(() => applyAction(state, { type: 'castle' })).toThrow(/Runes.*Influence/);
    for (const topic of ['Mathematics & Logic', 'Society & History']) {
      state = applyAction(state, { type: 'answer', id: topic, topic, correct: true });
    }
    const upgraded = applyAction(state, { type: 'castle' });
    expect(upgraded.castle).toBe(2);
    expect(upgraded.gold).toBe(0);
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
    expect(() => applyAction({ ...state, gold: 19 }, { type: 'building', id })).toThrow(/Gold/);
    const upgraded = applyAction(state, { type: 'building', id });
    expect(upgraded.gold).toBe(0);
    expect(upgraded.buildings[id]).toBe(2);
    for (const topic of TOPICS) {
      expect(upgraded.tokens[topic]).toBe((topics as readonly string[]).includes(topic) ? 0 : 100);
    }
  });

  it('enforces costs, castle prerequisites, building caps and sequential battle progression', () => {
    let s = newKingdom();
    expect(() => applyAction(s, { type: 'castle' })).toThrow(/Gold/);
    expect(() => applyAction(s, { type: 'building', id: 'barracks' })).toThrow(/Force/);
    expect(() => applyAction(s, { type: 'start', stage: 1 })).toThrow(/building/);
    s = fund(s, 20);
    expect(() => applyAction(s, { type: 'building', id: 'stable' })).toThrow(/Castle level 2/);
    s = applyAction(s, { type: 'building', id: 'barracks' });
    expect(() => applyAction(s, { type: 'building', id: 'barracks' })).toThrow(/Castle/);
    expect(() => applyAction(s, { type: 'start', stage: 2 })).toThrow(/previous/);
    expect(() => applyAction(s, { type: 'start', stage: NaN })).toThrow();
    s = applyAction(s, { type: 'start', stage: 1 });
    expect(() => applyAction(s, { type: 'castle' })).toThrow(/battle/);
    expect(() => applyAction(s, { type: 'building', id: 'range' })).toThrow(/battle/);
    expect(s.battle!.fighters.map(f => f.kind)).toEqual(['barracks']);
    expect(s.battle!.nextSpawn.barracks).toBe(1.5);
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.fighters).toHaveLength(1);
  });

  it('can unlock and improve all four units through learning and advance through chapter boundaries', () => {
    let s = fund(newKingdom(), 180);
    for (let i = 1; i < 5; i++) s = applyAction(s, { type: 'castle' });
    for (const building of BUILDINGS) {
      for (let i = 0; i < 5; i++) s = applyAction(s, { type: 'building', id: building.id });
      expect(unitStats(building.id, 5).hp).toBeGreaterThan(unitStats(building.id, 1).hp);
      expect(unitStats(building.id, 5).damage).toBeGreaterThan(unitStats(building.id, 1).damage);
    }
    expect(() => applyAction(s, { type: 'castle' })).toThrow(/maximum/);
    for (let stage = 1; stage <= 11; stage++) {
      s = fight(s, stage);
      expect(s.battle!.result, `stage ${stage}`).toBe('victory');
      expect(s.cleared).toBe(stage);
    }
    expect([1, 9, 10, 11, 20, 21].map(stageLabel)).toEqual(['1-1', '1-9', '1-10', '2-1', '2-10', '3-1']);
    expect(() => fight(s, 1)).toThrow(/next unbeaten/);
    expect(() => fight(s, 13)).toThrow(/previous/);
    expect(parseKingdom(JSON.stringify(s))).toEqual(s);
  });

  it('handles defeat, retreat, timeout and retries without consuming permanent progress', () => {
    const ready = applyAction(fund(newKingdom()), { type: 'building', id: 'barracks' });
    let s = applyAction({ ...ready, cleared: 40 }, { type: 'start', stage: 41 });
    for (let i = 0; i < 480 && !s.battle!.result; i++) s = applyAction(s, { type: 'tick' });
    expect(s.battle!.result).toBe('defeat');
    expect(s.cleared).toBe(40);
    expect(s.buildings).toEqual(ready.buildings);
    s = applyAction(s, { type: 'start', stage: 41 });
    expect(s.battle!.nextSpawn.barracks).toBe(1.5);
    expect(s.battle!.playerHp).toBe(240);
    s.battle!.elapsed = 119.75;
    s.battle!.nextEnemy = 125;
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.result).toBe('draw');
    s = applyAction(s, { type: 'start', stage: 41 });
    s = applyAction(s, { type: 'retreat' });
    expect(s.battle!.result).toBe('defeat');
    expect(s.gold).toBe(ready.gold);
  });

  it('makes upgrades change the outcome against the final enemy army', () => {
    let weak = applyAction(fund(newKingdom(), 180), { type: 'building', id: 'barracks' });
    weak.cleared = 40;
    const weakResult = fight(weak, 41);
    expect(weakResult.battle!.result).not.toBe('victory');
    for (let i = 1; i < 5; i++) weak = applyAction(weak, { type: 'castle' });
    for (let i = 1; i < 5; i++) weak = applyAction(weak, { type: 'building', id: 'barracks' });
    expect(fight(weak, 41).battle!.result).toBe('victory');
  });

  it('applies simultaneous castle damage as a draw and stops advancing completed battles', () => {
    let s = applyAction(applyAction(fund(newKingdom()), { type: 'building', id: 'barracks' }), { type: 'start', stage: 1 });
    s.battle!.playerHp = 1; s.battle!.enemyHp = 1;
    s.battle!.nextId = 3;
    s.battle!.fighters = [
      { id: 1, kind: 'barracks', side: 'player', x: 99, hp: 65, maxHp: 65, damage: 12, range: 3, speed: 7 },
      { id: 2, kind: 'barracks', side: 'enemy', x: 1, hp: 65, maxHp: 65, damage: 12, range: 3, speed: 7 },
    ];
    s = applyAction(s, { type: 'tick' });
    expect(s.battle!.result).toBe('draw');
    expect(s.gold).toBe(20);
    expect(applyAction(s, { type: 'tick' })).toEqual(s);
  });
});

describe('Castle persistence', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it('migrates supply-era saves without losing fighters or campaign progress', () => {
    const state = applyAction({ ...newKingdom(), cleared: 5, buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 6 });
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.battle.playerSpawned;
    delete legacy.battle.nextSpawn;
    legacy.battle.supply = 10;
    const restored = parseKingdom(JSON.stringify(legacy));
    expect(restored.cleared).toBe(5);
    expect(restored.battle!.fighters).toEqual(state.battle!.fighters);
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
    await changeKingdom('alice', { type: 'start', stage: 1 });
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
