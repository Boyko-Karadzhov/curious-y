import { expect, it } from 'vitest';
import balance from '../../supabase/functions/_shared/game-balance.json';
import { BUILDING_DEFINITIONS, TOPICS, UNITS, buildingCost, castleCost } from '../lib/kingdom/game';

it('keeps visible names and resource-keyed costs in balance', () => {
    expect(Object.keys(balance.building).sort()).toEqual(BUILDING_DEFINITIONS.map(building => building.id).sort());
    expect(BUILDING_DEFINITIONS.every(building => building.name === balance.building[building.id].name)).toBe(true);
    expect(UNITS.every(unit => unit.name === balance.unit.names[unit.id])).toBe(true);
    expect(Object.keys(balance.unit.names).sort()).toEqual(UNITS.map(unit => unit.id).sort());
    expect(Object.values(balance.building).every(building => typeof building.cost === 'object')).toBe(true);
    expect([balance.keep.cost, balance.recruitment.cost, balance.forge.cost].every(cost => typeof cost === 'object')).toBe(true);
    expect(BUILDING_DEFINITIONS.every(building => Object.keys(buildingCost(building.id, 0).resources).every(topic => TOPICS.includes(topic as typeof TOPICS[number])))).toBe(true);
    expect(castleCost(2).gold).toBe(balance.keep.cost.gold * 2);
});
