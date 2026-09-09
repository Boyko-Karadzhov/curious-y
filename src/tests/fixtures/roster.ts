import { UNITS, type Kingdom } from '../../lib/kingdom/game';
export function seedRoster(s: Kingdom): Kingdom {
    for (const u of UNITS) {
        if (s.buildings[u.building] > 0 && (u.tier === 1 || s.armySlots.includes(u.id))) {
            s.buildings.barracks = Math.max(1,s.buildings.barracks);
            s.recruitCount.barracks = (s.buildings.barracks-1)*10;
            s.units[u.id] ??= { unitId:u.id, investedXP:0, locked:false };
        }
    }
    s.buildings.academy = Math.min(2,s.buildings.academy);
    s.lifetimeGold = Math.max(s.gold,s.lifetimeGold);
    return s;
}
