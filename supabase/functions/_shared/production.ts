import type { Kingdom } from './kingdom.ts';

export const BASE_GOLD = 100;
export const FOOD_PER_FARM_LEVEL = 8;
export const METAL_PER_MINUTE_PER_LEVEL = 1;
export const utcDay = (now: string = new Date().toISOString()) => now.slice(0, 10);

export function availableProduction(state: Kingdom, now: string = new Date().toISOString()) {
    const food = state.buildings.farm > 0 && state.production.foodDay !== utcDay(now)
        ? state.buildings.farm * FOOD_PER_FARM_LEVEL : 0;
    const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(state.production.metalAt)) / 60000));
    const metal = state.buildings.smelter > 0
        ? Math.min(state.buildings.smelter * 1440, state.production.metalStored + minutes * state.buildings.smelter * METAL_PER_MINUTE_PER_LEVEL) : 0;
    const gold = state.tribute.day !== utcDay(now) || !state.tribute.claimed
        ? BASE_GOLD + Math.floor(state.cleared * 10 * (100 + Math.min(5, state.buildings.treasury) * 2) / 100) : 0;
    const battle = state.battle?.result === 'victory' && !state.battle.rewardCollected
        ? state.battle.config.reward?.totalGold ?? 0 : 0;
    return {
        gold,
        food,
        metal,
        battle
    };
}

export function storeMetalBeforeUpgrade(state: Kingdom, now: string) {
    state.production.metalStored = availableProduction(state, now).metal;
    state.production.metalAt = now;
}

export function collectProduction(state: Kingdom, now: string) {
    const available = availableProduction(state, now);
    if (!Object.values(available).some(Boolean)) {
        throw new Error('No resources are ready to collect.');
    }

    state.gold += available.gold + available.battle;
    state.lifetimeGold += available.gold + available.battle;
    state.food += available.food;
    state.metal += available.metal;
    if (available.food) {
        state.production.foodDay = utcDay(now);
    }

    if (available.metal) {
        const elapsed = Math.max(0, Math.floor((Date.parse(now) - Date.parse(state.production.metalAt)) / 60000));
        state.production.metalAt = available.metal >= state.buildings.smelter * 1440
            ? now : new Date(Date.parse(state.production.metalAt) + elapsed * 60000).toISOString();
        state.production.metalStored = 0;
    }

    state.tribute = {
        day: utcDay(now),
        territories: state.cleared,
        correct: false,
        claimed: true,
        paid: available.gold || state.tribute.paid
    };
    if (available.battle && state.battle) {
        state.battle.paidGold = available.battle;
        state.battle.rewardCollected = true;
    }
}
