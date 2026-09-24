import type { Kingdom } from './kingdom.ts';
import balance from './game-balance.json' with { type: 'json' };

export const BASE_GOLD = balance.economy.baseGold;
export const FOOD_PER_FARM_LEVEL = balance.economy.foodPerFarmLevel;
export const METAL_PER_MINUTE_PER_LEVEL = balance.economy.metalPerMinutePerLevel;
export const utcDay = (now: string = new Date().toISOString()) => now.slice(0, 10);

export function availableProduction(state: Kingdom, now: string = new Date().toISOString()) {
    const food = state.buildings.farm > 0 && state.production.foodDay !== utcDay(now)
        ? state.buildings.farm * FOOD_PER_FARM_LEVEL : 0;
    const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(state.production.metalAt)) / 60000));
    const metal = state.buildings.smelter > 0
        ? Math.min(state.buildings.smelter * balance.economy.metalStorageMinutes, state.production.metalStored + minutes * state.buildings.smelter * METAL_PER_MINUTE_PER_LEVEL) : 0;
    const gold = state.tribute.day !== utcDay(now) || !state.tribute.claimed
        ? BASE_GOLD + Math.floor(state.cleared * balance.economy.tributePerTerritory * (100 + Math.min(balance.building.treasury.cap, state.buildings.treasury) * balance.economy.treasuryGoldPercentPerLevel) / 100) : 0;
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

function creditProduction(state: Kingdom, available: ReturnType<typeof availableProduction>) {
    state.gold += available.gold + available.battle;
    state.lifetimeGold += available.gold + available.battle;
    state.food += available.food;
    state.metal += available.metal;
}

function markCollectedFood(state: Kingdom, now: string, food: number) {
    if (food) {
        state.production.foodDay = utcDay(now);
    }
}

function resetMetalClock(state: Kingdom, now: string, metal: number) {
    if (!metal) {
        return;
    }

    const elapsed = Math.max(0, Math.floor((Date.parse(now) - Date.parse(state.production.metalAt)) / 60000));
    state.production.metalAt = metal >= state.buildings.smelter * balance.economy.metalStorageMinutes
        ? now : new Date(Date.parse(state.production.metalAt) + elapsed * 60000).toISOString();
    state.production.metalStored = 0;
}

function markCollectedBattle(state: Kingdom, battle: number) {
    if (!battle || !state.battle) {
        return;
    }

    state.battle.paidGold = battle;
    state.battle.rewardCollected = true;
}

export function collectProduction(state: Kingdom, now: string) {
    const available = availableProduction(state, now);
    if (!Object.values(available).some(Boolean)) {
        throw new Error('No resources are ready to collect.');
    }

    creditProduction(state, available);
    markCollectedFood(state, now, available.food);
    resetMetalClock(state, now, available.metal);
    state.tribute = {
        day: utcDay(now),
        territories: state.cleared,
        correct: false,
        claimed: true,
        paid: available.gold || state.tribute.paid
    };
    markCollectedBattle(state, available.battle);
}
