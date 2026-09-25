import { expect, it } from 'vitest';
import balance from '../../supabase/functions/_shared/game-balance.json';
import { applyAction, BUILDING_DEFINITIONS, UNITS, buildingCost, canAfford, castleCost, newKingdom } from '../lib/kingdom/game';
import { KNOWLEDGE_RESOURCES } from '../game/economy';

it('keeps visible names and resource-keyed costs in balance', () => {
    expect(Object.keys(balance.building).sort()).toEqual(BUILDING_DEFINITIONS.map(building => building.id).sort());
    expect(BUILDING_DEFINITIONS.every(building => building.name === balance.building[building.id].name)).toBe(true);
    expect(UNITS.every(unit => unit.name === balance.unit.names[unit.id])).toBe(true);
    expect(Object.keys(balance.unit.names).sort()).toEqual(UNITS.map(unit => unit.id).sort());
    expect(Object.values(balance.building).every(building => typeof building.cost === 'object')).toBe(true);
    expect([balance.keep.cost, balance.recruitment.cost, balance.forge.cost].every(cost => typeof cost === 'object')).toBe(true);
    const resourceNames: readonly string[] = ['Gold', 'Food', 'Metal', ...KNOWLEDGE_RESOURCES.map(resource => resource.name)];
    expect([balance.keep.cost, balance.demo.castleUpgradeCost, balance.recruitment.cost, balance.forge.cost,
        ...Object.values(balance.building).map(building => building.cost)]
        .every(cost => Object.keys(cost).every(name => resourceNames.includes(name)))).toBe(true);
    expect(buildingCost('academy', 0)).toEqual({
        Gold: 30,
        Runes: 10,
        'Logic Cores': 10
    });
    expect(castleCost(2).Gold).toBe(balance.keep.cost.Gold * 2);
});

it('spends named resources from their matching topic balances', () => {
    const state = newKingdom();
    state.castle = 2;
    state.gold = 30;
    state.tokens['Mathematics & Logic'] = 10;
    state.tokens['Computer Science'] = 10;
    const cost = buildingCost('academy', 0);
    expect(canAfford(state, cost)).toBe(true);
    const upgraded = applyAction(state, {
        type: 'building',
        id: 'academy'
    });
    expect(upgraded.tokens['Mathematics & Logic']).toBe(0);
    expect(upgraded.tokens['Computer Science']).toBe(0);
});

it('starts with every configured resource amount', () => {
    expect(Object.keys(balance.economy).sort()).toEqual(['startingResources', 'battleRewards', 'dailyProduction', 'treasury', 'trade'].sort());
    const starting = balance.economy.startingResources;
    const names = ['Gold', 'Food', 'Metal', ...KNOWLEDGE_RESOURCES.map(resource => resource.name)];
    expect(Object.keys(starting).sort()).toEqual(names.sort());
    const state = newKingdom();
    expect([state.gold, state.food, state.metal]).toEqual([starting.Gold, starting.Food, starting.Metal]);
    for (const resource of KNOWLEDGE_RESOURCES) {
        expect(state.tokens[resource.topic]).toBe(starting[resource.name]);
    }
});
