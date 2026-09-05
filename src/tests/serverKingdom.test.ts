import { describe, expect, it } from 'vitest';
import { applyAction, newKingdom } from '../lib/kingdom/game';
import { executeKingdomCommand, parseKingdomCommand, type CommandContext } from '../../supabase/functions/learning/kingdom';

const context = (): CommandContext => ({ state: newKingdom(), revision: 0, generation: 0, battle_clock: null, server_now: '2026-09-05T12:00:00Z' });
describe('Trusted Castle command boundary', () => {
  it.each(['answer','save','victory','reset','deploy'])('rejects a fabricated %s command', type => {
    expect(() => parseKingdomCommand({ type, correct: true, gold: 100000, cleared: 5 })).toThrow();
  });
  it('accepts only intent fields, discarding supplied balance, clock, and fighter stats', () => {
    expect(parseKingdomCommand({ type: 'start', stage: 1, damage: 9999, supply: 20, elapsed: 120, playerSpawned: 100 }))
      .toEqual({ type: 'start', stage: 1 });
    expect(() => executeKingdomCommand(context(), { type: 'castle' })).toThrow(/Gold/);
    expect(() => executeKingdomCommand(context(), { type: 'exchange', topic: 'Cheat' as never })).toThrow();
  });
  it('repeated requests without elapsed server time cannot speed up combat', () => {
    const c = context(); c.state.buildings.barracks=1;
    const started=executeKingdomCommand(c,{type:'start',stage:1});
    let next={...c,state:started.state,battle_clock:started.battleClock};
    for(let i=0;i<100;i++) {
      const result=executeKingdomCommand(next,{type:'tick'});
      next={...next,state:result.state,battle_clock:result.battleClock};
    }
    expect(next.state.battle!.elapsed).toBe(0);
    expect(next.state.battle!.supply).toBe(1);
    expect(next.state.battle!.playerSpawned).toBe(3);
    const later=executeKingdomCommand({...next,server_now:'2026-09-05T12:00:01Z'},{type:'tick'});
    expect(later.state.battle!.elapsed).toBe(1);
    expect(later.state.battle!.supply).toBe(0);
    expect(later.state.battle!.playerSpawned).toBe(4);
  });
  it('recruits and resolves an offline battle using stored building stats', () => {
    const c=context(); c.state.buildings.barracks=1;
    c.state=applyAction(c.state,{type:'start',stage:1}); c.battle_clock=c.server_now;
    c.server_now='2026-09-05T13:00:00Z';
    const result=executeKingdomCommand(c,{type:'tick'});
    expect(result.state.battle!.result).toBe('victory');
    expect(result.state.battle!.playerSpawned).toBeGreaterThan(3);
    expect(result.state.cleared).toBe(1);
    expect(result.state.battle!.elapsed).toBeLessThanOrEqual(120);
    expect(result.battleClock).toBeNull();
  });
});
