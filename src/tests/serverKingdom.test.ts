import { describe, expect, it } from 'vitest';
import { applyAction, newKingdom } from '../lib/kingdom/game';
import { executeKingdomCommand, parseKingdomCommand, type CommandContext } from '../../supabase/functions/learning/kingdom';

const context = (): CommandContext => ({ state: newKingdom(), revision: 0, generation: 0, battle_clock: null, server_now: '2026-09-05T12:00:00Z' });
describe('Trusted Castle command boundary', () => {
  it.each(['answer','save','victory','reset'])('rejects a fabricated %s command', type => {
    expect(() => parseKingdomCommand({ type, correct: true, gold: 100000, cleared: 5 })).toThrow();
  });
  it('accepts only intent fields, discarding supplied balance, clock, and fighter stats', () => {
    expect(parseKingdomCommand({ type: 'deploy', id: 'barracks', damage: 9999, supply: 20, elapsed: 120 }))
      .toEqual({ type: 'deploy', id: 'barracks' });
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
    expect(next.state.battle!.supply).toBe(10);
    const later=executeKingdomCommand({...next,server_now:'2026-09-05T12:00:01Z'},{type:'tick'});
    expect(later.state.battle!.elapsed).toBe(1);
    expect(later.state.battle!.supply).toBe(12);
  });
  it('uses stored building stats and catches up offline battles before accepting a deployment', () => {
    const c=context(); c.state.buildings.barracks=1;
    c.state=applyAction(c.state,{type:'start',stage:1}); c.battle_clock=c.server_now;
    c.server_now='2026-09-05T13:00:00Z';
    expect(() => executeKingdomCommand(c,{type:'deploy',id:'barracks'})).toThrow(/Start a battle/);
    const result=executeKingdomCommand(c,{type:'tick'});
    expect(result.state.battle!.result).not.toBeNull();
    expect(result.state.battle!.elapsed).toBeLessThanOrEqual(120);
    expect(result.battleClock).toBeNull();
  });
});
