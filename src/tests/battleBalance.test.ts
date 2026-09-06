import { seedRoster } from './fixtures/roster';
import { describe, expect, it } from 'vitest';
import { applyAction, battleSeconds, battleSpeed, createBattle, newKingdom, parseKingdom, reconcileUnits, UNITS, unitStats, type ArmySlots, type Kingdom } from '../lib/kingdom/game';
import { executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { motionX, visualUnits } from '../lib/kingdom/battleAnimation';
import legacy from './fixtures/rules5-battle-balance.json';

function army(keep: number, tier: number, slots: ArmySlots): Kingdom {
  const s = newKingdom(); s.castle = keep;
  for (const id of slots) if (id) s.buildings[UNITS.find(u => u.id === id)!.building] = tier;
  s.armySlots = slots;
  return seedRoster(reconcileUnits(s));
}
function fight(state: Kingdom, stage: number) {
  let s = applyAction({ ...state, cleared: stage - 1 }, { type: 'start', stage });
  while (!s.battle!.result) s = applyAction(s, { type: 'tick' });
  return s.battle!;
}

describe('Battle balance and learning progression', () => {
  it('wins 1-1 with the first Barracks; 1-2 needs reinforcements', () => {
    const starter = army(1, 1, ['militia', null, null, null, null]);
    expect(fight(starter, 1).result).toBe('victory');
    expect(fight(starter, 2).result).not.toBe('victory');
    const reinforced = army(1, 1, ['militia', 'slinger', null, null, null]);
    expect(fight(reinforced, 2).result).toBe('victory');
    expect(fight(reinforced, 3).result).toBe('victory');
    expect(fight(reinforced, 4).result).toBe('victory');
    expect(fight(reinforced, 5).result).toBe('victory');
  });

  it('makes the next roster tier win faster at every chapter transition', () => {
    for(let tier=2;tier<=5;tier++) {
      const stage=(tier-1)*10+1;
      const ids=(t: number) => [...['melee','ranged','mounted','siege'].map(c=>UNITS.find(u=>u.unitClass===c&&u.tier===t)!.id), null] as ArmySlots;
      const prior=army(Math.max(3,tier),tier,ids(tier-1));
      for(const id of prior.armySlots) if(id) prior.units[id].investedXP=0;
      const priorBattle = fight(prior,stage);
      expect(priorBattle.result).toBe('victory');
      const upgraded=army(Math.max(3,tier),tier,ids(tier));
      for(const id of upgraded.armySlots) if(id) upgraded.units[id].investedXP=20*3**(UNITS.find(u=>u.id===id)!.tier-1);
      const upgradedBattle = fight(upgraded,stage);
      expect(upgradedBattle.result).toBe('victory');
      expect(upgradedBattle.elapsed).toBeLessThan(priorBattle.elapsed);
      const next=createBattle(upgraded,stage);
      expect(next.config.enemy.units[0].id).toBe(ids(tier)[0]);
      expect(next.config.enemy.units[0].hp).toBeGreaterThan(unitStats(ids(tier-1)[0] as never,1).hp*2);
      expect(next.enemyMaxHp).toBeGreaterThan(createBattle(prior,stage-1).enemyMaxHp);
    }
  });

  it('runs at fivefold wall speed, with matching visual movement and drift-free polling', () => {
    const state = applyAction(army(1, 1, ['militia', null, null, null, null]), { type: 'start', stage: 1 });
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

  it('resets pre-recruitment saves consistently', () => {
    for (const {saved} of legacy) {const s=parseKingdom(JSON.stringify(saved));expect(s.battle).toBeNull();expect(s.units).toEqual({});expect(s.tokens).toEqual(saved.tokens);}
  });
});
