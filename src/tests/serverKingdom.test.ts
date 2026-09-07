import { describe, expect, it } from 'vitest';
import { applyAction, newKingdom, parseKingdom } from '../lib/kingdom/game';
import { executeKingdomCommand, parseKingdomCommand, type CommandContext } from '../../supabase/functions/learning/kingdom';

const context = (): CommandContext => ({ state: newKingdom(), revision: 0, generation: 0, battle_clock: null, server_now: '2026-09-05T12:00:00Z' });
describe('Trusted Castle command boundary', () => {
  it.each([7, 8, 9] as const)('enforces the wall timeout for rules %s across polling and reload', version => {
    const c = context(); c.state.buildings.barracks = 1; c.state.units.militia={unitId:'militia',investedXP:0,locked:false}; c.state.armySlots = ['militia', null, null, null, null];
    const started = executeKingdomCommand(c, { type: 'start', stage: 1 });
    const battle = started.state.battle!;
    battle.config.rulesVersion = version;
    if (version < 9) battle.config.slots = battle.config.slots.slice(0, 4);
    battle.config.maxSeconds = version === 7 ? 90 : 450;
    // Isolate the timeout with valid delayed recruitment and both Keeps intact.
    battle.nextSpawn.militia = battle.config.maxSeconds;
    battle.nextEnemy = battle.config.maxSeconds;
    const base = { ...c, state: started.state, battle_clock: started.battleClock };
    const timeoutMs = version === 7 ? 18000 : 90000;
    let split = base;
    for (const ms of [1000, 17950, timeoutMs - 50]) {
      const server_now = new Date(Date.parse(c.server_now) + ms).toISOString();
      const next = executeKingdomCommand({ ...split, server_now }, { type: 'tick' });
      expect(next.state.battle!.result).toBeNull();
      split = { ...split, state: parseKingdom(JSON.stringify(next.state)), battle_clock: next.battleClock };
    }
    const server_now = new Date(Date.parse(c.server_now) + timeoutMs).toISOString();
    const ended = executeKingdomCommand({ ...split, server_now }, { type: 'tick' });
    expect(ended.state.battle!.elapsed).toBe(battle.config.maxSeconds);
    expect(ended.state.battle!.result).toBe('draw');
    expect(ended.battleClock).toBeNull();
    expect(ended).toEqual(executeKingdomCommand({ ...base, server_now }, { type: 'tick' }));
  });

  it('collects only the trusted pending victory, including after offline completion', () => {
    const c = context(); c.state.buildings.barracks = 1; c.state.units.militia={unitId:'militia',investedXP:0,locked:false}; c.state.armySlots = ['militia', null, null, null, null];
    const started = executeKingdomCommand(c, { type: 'start', stage: 1 });
    const command = parseKingdomCommand({ type: 'collect-battle', stage: 1, gold: 999999 });
    expect(command).toEqual({ type: 'collect-battle', stage: 1 });
    const active = { ...c, state: started.state, battle_clock: started.battleClock };
    expect(() => executeKingdomCommand(active, command)).toThrow(/no reward/);
    const offline = { ...active, server_now: '2026-09-05T13:00:00Z' };
    const won = executeKingdomCommand(offline, { type: 'tick' });
    const pending = { ...offline, state: won.state, battle_clock: won.battleClock };
    expect(pending.state.gold).toBe(0);
    expect(() => executeKingdomCommand(pending, { type: 'start', stage: 2 })).toThrow(/Collect/);
    expect(() => executeKingdomCommand(pending, { type: 'collect-battle', stage: 2 })).toThrow(/no reward/);
    const collected = executeKingdomCommand(pending, command);
    expect(collected.state.gold).toBe(60);
    expect(collected.state.battle!.rewardCollected).toBe(true);
    expect(executeKingdomCommand({ ...pending, state: collected.state }, command).state.gold).toBe(60);
  });

  it('accepts only army intent and validates eligibility against trusted ownership', () => {
    const command = parseKingdomCommand({ type: 'army', slots: ['scout-rider', null, null, null, null], damage: 999, rulesVersion: 1 });
    expect(command).toEqual({ type: 'army', slots: ['scout-rider', null, null, null, null] });
    expect(() => executeKingdomCommand(context(), command)).toThrow(/owned recruit/);
    for (const slots of [null, [], ['militia'], ['invalid', null, null, null]]) {
      expect(() => parseKingdomCommand({ type: 'army', slots })).toThrow();
    }
  });

  it('catches up identically across fractional polling and absence using frozen stats', () => {
    const c = context(); c.state.buildings.barracks = 1; c.state.units.militia={unitId:'militia',investedXP:0,locked:false}; c.state.armySlots = ['militia', null, null, null, null];
    const start = executeKingdomCommand(c, { type: 'start', stage: 1 });
    const base = { ...c, state: start.state, battle_clock: start.battleClock };
    let split = base;
    for (const ms of [1100, 2450, 4900, 10000, 80000]) {
      const server_now = new Date(Date.parse(c.server_now) + ms).toISOString();
      const next = executeKingdomCommand({ ...split, server_now }, { type: 'tick' });
      split = { ...split, server_now, state: next.state, battle_clock: next.battleClock };
    }
    const absent = executeKingdomCommand({ ...base, server_now: split.server_now }, { type: 'tick' });
    expect(split.state).toEqual(absent.state);
    expect(absent.state.battle!.elapsed).toBe(72.5);
    expect(absent.state.gold).toBe(0);
    expect(() => executeKingdomCommand(base, { type: 'army', slots: [null, null, null, null, null] })).toThrow(/battle/);
    expect(executeKingdomCommand({ ...base, server_now: split.server_now }, { type: 'army', slots: [null, null, null, null, null] }).state.armySlots).toEqual([null, null, null, null, null]);
  });

  it('resets old battles coherently instead of mixing legacy ownership with recruitment',()=>{
    const c=context();c.state={...c.state,version:7} as never;
    const reset=executeKingdomCommand(c,{type:'tick'});expect(reset.state.battle).toBeNull();expect(reset.state.units).toEqual({});expect(reset.state.version).toBe(9);
  });

  it('accepts only intent fields, discarding supplied balance, clock, and fighter stats', () => {
    expect(parseKingdomCommand({ type: 'start', stage: 1, damage: 9999, supply: 20, elapsed: 120, playerSpawned: 100 }))
      .toEqual({ type: 'start', stage: 1 });
    expect(() => executeKingdomCommand(context(), { type: 'castle' })).toThrow(/Runes.*Influence/);
    expect(() => parseKingdomCommand({ type: 'exchange', topic: 'Physics' })).toThrow();
  });
  it('repeated requests without elapsed server time cannot speed up combat', () => {
    const c = context(); c.state.buildings.barracks=1; c.state.units.militia={unitId:'militia',investedXP:0,locked:false}; c.state.armySlots=['militia',null,null,null, null];
    const started=executeKingdomCommand(c,{type:'start',stage:1});
    let next={...c,state:started.state,battle_clock:started.battleClock};
    for(let i=0;i<100;i++) {
      const result=executeKingdomCommand(next,{type:'tick'});
      next={...next,state:result.state,battle_clock:result.battleClock};
    }
    expect(next.state.battle!.elapsed).toBe(0);
    expect(next.state.battle).not.toHaveProperty('supply');
    expect(next.state.battle!.playerSpawned).toBe(0);
    const later=executeKingdomCommand({...next,server_now:'2026-09-05T12:00:05Z'},{type:'tick'});
    expect(later.state.battle!.elapsed).toBe(25);
    expect(later.state.battle!.nextSpawn.militia).toBe(27);
    expect(later.state.battle!.playerSpawned).toBe(5);
  });
  it('recruits and resolves an offline battle using stored building stats', () => {
    const c=context(); c.state.buildings.barracks=1; c.state.units.militia={unitId:'militia',investedXP:0,locked:false}; c.state.armySlots=['militia',null,null,null, null];
    c.state=applyAction(c.state,{type:'start',stage:1}); c.battle_clock=c.server_now;
    c.server_now='2026-09-05T13:00:00Z';
    const result=executeKingdomCommand(c,{type:'tick'});
    expect(result.state.battle!.result).toBe('victory');
    expect(result.state.battle!.playerSpawned).toBeGreaterThan(3);
    expect(result.state.cleared).toBe(1);
    expect(result.state.battle!.elapsed).toBeLessThanOrEqual(90);
    expect(result.battleClock).toBeNull();
    expect(result.state.gold).toBe(0);
    const retried = executeKingdomCommand({ ...c, state: result.state, battle_clock: result.battleClock }, { type: 'tick' });
    expect(retried.state.gold).toBe(0);
  });
});
