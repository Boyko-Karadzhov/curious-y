import { describe, expect, it } from 'vitest';
import { advanceBattle, applyAction, newKingdom, parseKingdom, replayBattle, type Kingdom, type UnitId } from '../lib/kingdom/game';
import { executeKingdomCommand, parseKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { BattlePlayback } from '../lib/kingdom/battlePlayback';
import { motionX, visualUnits } from '../lib/kingdom/battleAnimation';

export function equippedKingdom(stage = 1, units: UnitId[] = ['militia']): Kingdom {
  const state = newKingdom();
  state.castle = 3;
  state.cleared = stage - 1;
  state.buildings = { barracks: 1, range: 1, stable: 1, workshop: 1, academy: 1, treasury: 0, library: 0, forge: 0 };
  state.armySlots = [null, null, null, null, null];
  units.forEach((unitId, index) => {
    state.units[unitId] = { unitId, investedXP: 0, locked: false };
    state.armySlots[index] = unitId;
  });
  return state;
}

export function settledKingdom(state = equippedKingdom(), id = 'battle-one', seed = .75) {
  return executeKingdomCommand({ state, revision: 0, generation: 0, battle_clock: null, server_now: '2026-09-07T00:00:00Z' },
    { type: 'start', stage: state.cleared + 1 }, { requestId: id, draws: [seed] });
}

describe('Settled battles and deterministic local simulation', () => {
  it.each([1, 5, 10, 20, 50])('matches the entire server state after JSON transport and irregular frames at stage %s', stage => {
    const state = equippedKingdom(stage, ['militia', 'slinger', 'hatchling', 'ballista', 'medic']);
    const settled = settledKingdom(state);
    expect(settled.battleClock).toBeNull();
    const outcome = parseKingdom(JSON.stringify(settled.state)).battle!;
    expect(outcome.result).not.toBeNull();
    expect(outcome.seed).toBe(3221225472);
    expect(settled.state.gold).toBe(0);
    const original = structuredClone(outcome);
    let client = replayBattle(outcome);
    const chunks = [1, 2, 1, 9, 3, 20, 1];
    for (let frame = 0; !client.result; frame++) client = advanceBattle(client, chunks[frame % chunks.length]);
    // Compare before the presentation layer substitutes the trusted endpoint.
    expect(client).toEqual(outcome);
    expect(outcome).toEqual(original);
    const playback = new BattlePlayback(outcome);
    for (let frame = 0; !playback.battle.result; frame++) playback.advance([16, 17, 8, 51, 240][frame % 5]);
    expect(playback.battle).toEqual(outcome);
  });

  it('settles a victory once and collects the trusted frozen reward once', () => {
    const settled = settledKingdom();
    const context = { ...settled, state: settled.state, revision: 1, generation: 0, battle_clock: null, server_now: '2026-09-07T00:00:00Z' };
    expect(settled.state.battle!.result).toBe('victory');
    expect(settled.state.cleared).toBe(1);
    expect(executeKingdomCommand(context, { type: 'tick' }).state).toEqual(settled.state);
    expect(() => executeKingdomCommand(context, { type: 'start', stage: 2 })).toThrow(/Collect/);
    expect(() => executeKingdomCommand(context, { type: 'retreat' })).toThrow(/no active battle/);
    const command = parseKingdomCommand({ type: 'collect-battle', stage: 1, gold: 999999, result: 'victory' });
    const collected = executeKingdomCommand(context, command);
    expect(collected.state.gold).toBe(60);
    expect(executeKingdomCommand({ ...context, state: collected.state }, command).state.gold).toBe(60);
    expect(parseKingdomCommand({ type: 'start', stage: 1, seed: 99, id: 'forged', fighters: [] })).toEqual({ type: 'start', stage: 1 });
  });

  it('replays a full-duration draw and never creates a victory reward', () => {
    const state = equippedKingdom(1, ['medic']);
    state.castle = 5;
    const settled = settledKingdom(state);
    const outcome = settled.state.battle!;
    expect(outcome.result).toBe('draw');
    expect(outcome.elapsed).toBe(outcome.config.maxSeconds);
    expect(advanceBattle(replayBattle(outcome), 1800)).toEqual(outcome);
    expect(settled.state.cleared).toBe(0);
    expect(() => applyAction(settled.state, { type: 'collect-battle', stage: 1 })).toThrow(/no reward/);
  });

  it('reconstructs only frozen inputs, independent of subsequent army and Keep changes', () => {
    const settled = settledKingdom();
    const changed = { ...settled.state, castle: 5, armySlots: [null, null, null, null, null] } as Kingdom;
    const initial = replayBattle(changed.battle!);
    expect(initial).toEqual({ ...applyAction(equippedKingdom(), { type: 'start', stage: 1 }).battle, id: 'battle-one', seed: 3221225472 });
    expect(advanceBattle(initial, 1800)).toEqual(settled.state.battle);
  });

  it('uses frame-independent steps and interpolates only known positions', () => {
    const outcome = settledKingdom().state.battle!;
    const smooth = new BattlePlayback(outcome);
    const delayed = new BattlePlayback(outcome);
    for (let i = 0; i < 300; i++) smooth.advance(1000 / 60);
    delayed.advance(5000);
    expect(smooth.battle).toEqual(delayed.battle);
    const before = visualUnits(smooth.battle, [], 0);
    const next = advanceBattle(smooth.battle);
    const after = visualUnits(next, before, .05);
    const moving = after.find(u => u.from !== u.to)!;
    expect(moving).toBeDefined();
    expect(motionX(moving, .025)).toBeCloseTo((moving.from + moving.to) / 2);
    expect(motionX(moving, 10)).toBe(moving.to);
  });

  it('shows the persisted outcome even if a client simulation diverges', () => {
    const outcome = settledKingdom().state.battle!;
    const playback = new BattlePlayback(outcome);
    playback.battle.playerHp = 0;
    playback.advance(50);
    expect(playback.battle).toBe(outcome);
    expect(playback.battle.result).toBe('victory');
  });
});
