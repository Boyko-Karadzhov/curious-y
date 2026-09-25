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
    const resourceNames: readonly string[] = KNOWLEDGE_RESOURCES.map(resource => resource.name);
    expect([balance.keep.cost, ...Object.values(balance.building).map(building => building.cost)]
        .every(cost => Object.keys('resources' in cost ? cost.resources : {}).every(name => resourceNames.includes(name)))).toBe(true);
    expect(buildingCost('academy', 0).resources).toEqual({
        Runes: 10,
        'Logic Cores': 10
    });
    expect(castleCost(2).gold).toBe(balance.keep.cost.gold * 2);
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
