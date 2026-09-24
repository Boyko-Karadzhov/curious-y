import { BUILDING_DEFINITIONS, type BuildingId, type Kingdom, canAfford, isRecruitingBuilding, recruitmentCost, forgeCost, unitDefinition, upgradeStatus } from './game';

/** The resource-spending action currently available at this Castle location. */
export function availableCastleAction(state: Kingdom, location: 'castle' | BuildingId): string | null {
    if (location === 'forge' && state.buildings.forge > 0) {
        return state.forge.pending ? 'Forged item ready' : canAfford(state, forgeCost()) ? 'Forging available' : null;
    }

    if (location !== 'castle' && isRecruitingBuilding(location) && state.buildings[location] > 0) {
        return canAfford(state, recruitmentCost(location)) ? 'Recruitment available' : null;
    }

    const action = location === 'castle' ? { type: 'castle' as const } : {
        type: 'building' as const,
        id: location
    };
    if (!upgradeStatus(state, action).ready) {
        return null;
    }

    return location === 'castle' || state.buildings[location] > 0 ? 'Upgrade available' : 'Build available';
}

export function hasAvailableCastleAction(state: Kingdom): boolean {
    return !!availableCastleAction(state, 'castle') || BUILDING_DEFINITIONS.some(({ id }) => !!availableCastleAction(state, id));
}

export function unitCollectionActions(state: Kingdom): Map<string, string> {
    const actions = new Map<string, string>();
    const copies = Object.entries(state.units);
    const equipped = new Set(state.armySlots.filter((id): id is string => id !== null));
    const spare = copies.filter(([id]) => !equipped.has(id));
    const mergeableClasses = new Set(spare.filter(([, unit]) => !unit.locked).map(([, unit]) => unitDefinition(unit.unitId).unitClass));
    if (state.armySlots.includes(null) && state.buildings.barracks > 0 && (!state.battle || !!state.battle.result)) {
        const represented = new Set(state.armySlots.filter((id): id is string => id !== null).map(id => state.units[id].unitId));
        for (const [id, unit] of spare) {
            if (!represented.has(unit.unitId)) {
                actions.set(id, 'Equip in an empty army slot');
                represented.add(unit.unitId);
            }
        }
    }

    for (const [id, unit] of copies) {
        if (equipped.has(id) && mergeableClasses.has(unitDefinition(unit.unitId).unitClass)) {
            actions.set(id, 'Merge a spare copy');
        }
    }

    return actions;
}
