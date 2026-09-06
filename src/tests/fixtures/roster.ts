import { UNITS, type Kingdom } from '../../lib/kingdom/game';
export function seedRoster(s: Kingdom): Kingdom {
  for (const u of UNITS) if (s.buildings[u.building] > 0 && (u.tier === 1 || s.armySlots.includes(u.id))) {
    s.recruitCount[u.building] = (s.buildings[u.building]-1)*10;
    s.units[u.id] ??= { unitId:u.id, investedXP:0, locked:false };
  }
  return s;
}
