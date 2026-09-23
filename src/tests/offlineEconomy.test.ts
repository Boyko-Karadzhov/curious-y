import { describe, expect, it } from 'vitest';
import { applyAction, availableProduction, newKingdom, tradeCost, type Kingdom } from '../lib/kingdom/game';

const at = (now: string) => ({
    requestId: 'economy',
    draws: [],
    now
});
const funded = () => {
    const state = newKingdom();
    state.castle = 2;
    state.tokens.Life = 100;
    state.tokens.Chemistry = 100;
    state.tokens['Society & History'] = 100;
    return state;
};

describe('offline economy', () => {
    it('starts with two recruitments and three forges worth of supplies', () => {
        const state = newKingdom();
        expect([state.gold, state.food, state.metal]).toEqual([0, 16, 24]);
        expect(availableProduction(state, '2026-09-23T12:00:00Z').gold).toBe(100);
    });

    it('replaces missed Farm days and caps Smelter storage at 24 hours', () => {
        let state = funded();
        state = applyAction(state, {
            type: 'building',
            id: 'farm'
        }, at('2026-09-20T12:00:00Z'));
        state = applyAction(state, {
            type: 'building',
            id: 'smelter'
        }, at('2026-09-20T12:00:00Z'));
        expect(availableProduction(state, '2026-09-20T23:59:00Z').food).toBe(0);
        expect(availableProduction(state, '2026-09-21T00:00:00Z').food).toBe(8);
        expect(availableProduction(state, '2026-09-23T12:00:00Z').food).toBe(8);
        expect(availableProduction(state, '2026-09-23T12:00:00Z').metal).toBe(1440);
        state = applyAction(state, { type: 'collect-production' }, at('2026-09-23T12:00:00Z'));
        expect([state.gold, state.food, state.metal]).toEqual([100, 24, 1464]);
        expect(availableProduction(state, '2026-09-23T12:01:00Z').metal).toBe(1);
        expect(availableProduction(state, '2026-09-23T12:01:00Z').food).toBe(0);
        state = applyAction(state, { type: 'collect-production' }, at('2026-09-23T12:01:00Z'));
        expect([state.gold, state.tribute.paid, state.metal]).toEqual([100, 100, 1465]);
        expect(availableProduction(state, '2026-09-23T12:01:00Z').gold).toBe(0);
    });

    it('keeps supply trades separate from knowledge exchanges', () => {
        let state: Kingdom = funded();
        state = applyAction(state, {
            type: 'building',
            id: 'market'
        });
        state.gold = state.lifetimeGold = 100;
        expect(tradeCost('gold', 'food', 2, 1)).toBe(20);
        state = applyAction(state, {
            type: 'trade',
            from: 'gold',
            to: 'food',
            amount: 2
        });
        expect([state.gold, state.food]).toEqual([80, 18]);
        state = applyAction(state, {
            type: 'trade',
            from: 'food',
            to: 'gold',
            amount: 2
        });
        expect([state.gold, state.food, state.lifetimeGold]).toEqual([90, 16, 110]);
        state = applyAction(state, {
            type: 'trade',
            from: 'Life',
            to: 'Chemistry',
            amount: 3
        });
        expect([state.tokens.Life, state.tokens.Chemistry]).toEqual([94, 103]);
        expect(() => applyAction(state, {
            type: 'trade',
            from: 'gold',
            to: 'Life',
            amount: 1
        })).toThrow(/Invalid Market trade/);
        expect(() => applyAction(state, {
            type: 'trade',
            from: 'Life',
            to: 'metal',
            amount: 1
        })).toThrow(/Invalid Market trade/);
    });
});
