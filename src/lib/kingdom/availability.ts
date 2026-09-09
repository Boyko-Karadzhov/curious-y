import { BUILDING_DEFINITIONS, type BuildingId, type Kingdom, canAfford, isRecruitingBuilding, recruitmentCost, forgeCost, upgradeStatus } from './game';

/** The resource-spending action currently available at this Castle location. */
export function availableCastleAction(state: Kingdom, location: 'castle' | BuildingId): string | null {
    if (location === 'forge' && state.buildings.forge > 0) {
        return state.forge.pending ? 'Forged item ready' : canAfford(state, forgeCost()) ? 'Forging available' : null;
    }

    if (location !== 'castle' && isRecruitingBuilding(location) && state.buildings[location] > 0) {
        return canAfford(state, recruitmentCost(location)) ? 'Recruitment available' : null;
    }

    const action = location === 'castle' ? { type: 'castle' as const } : { type: 'building' as const, id: location };
    if (!upgradeStatus(state, action).ready) {
        return null;
    }

    return location === 'castle' || state.buildings[location] > 0 ? 'Upgrade available' : 'Build available';
}

export function hasAvailableCastleAction(state: Kingdom): boolean {
    return !!availableCastleAction(state, 'castle') || BUILDING_DEFINITIONS.some(({ id }) => !!availableCastleAction(state, id));
}
