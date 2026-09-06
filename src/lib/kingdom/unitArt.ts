import { UnitId, UNITS } from './game';

export interface UnitArt {
  portrait: string;
  displayHeight: number;
  idleHeight: number;
  atlas: { src: string; columns: number; rows: number; frameSize: number; anchorX: number; anchorY: number };
}

// Presentation belongs here, outside combat/save definitions. Every surface
// resolves a unit through this registry, and portraits come from approved poses.
// Measured first-idle silhouettes in the normalized atlas. Weapon reach can
// force smaller drawings inside a cell; it must not shrink the unit in game.
const idleHeights: Record<UnitId, number> = {
  swordsman: 179, archer: 212, medic: 106, spearman: 91, shieldbearer: 166,
  berserker: 160, duelist: 88, slinger: 196, crossbowman: 112, ranger: 182,
  'clockwork-gunner': 125, 'scout-rider': 125, knight: 139, lancer: 141,
  catapult: 130, ram: 149, bombardier: 154, 'frost-mage': 125,
  'battle-sage': 123, 'astral-colossus': 126,
};
const generated = Object.fromEntries(UNITS.map(({ id }) => [id, {
  portrait: `/assets/units/${id}-v1/portrait.png`,
  idleHeight: idleHeights[id],
  displayHeight: ['knight', 'scout-rider', 'lancer', 'astral-colossus'].includes(id) ? 76 : 64,
  atlas: { src: `/assets/units/${id}-v1/atlas.png`, columns: 4, rows: 3, frameSize: 256,
    anchorX: id === 'swordsman' ? 112 / 256 : .5, anchorY: 232 / 256 },
}])) as Record<UnitId, UnitArt>;

export function unitArt(id: UnitId): UnitArt {
  return generated[id];
}

export function unitArtFrame(id: UnitId, pose: 'idle' | 'walk' | 'attack', seconds: number, attackSeconds: number, reducedMotion = false) {
  const atlas = unitArt(id).atlas;
  if (reducedMotion) return { row: 0, column: 0 };
  const duration = pose === 'attack' ? attackSeconds : pose === 'walk' ? .8 : 1.2;
  return { row: pose === 'attack' ? 2 : pose === 'walk' ? 1 : 0,
    column: Math.floor(((Math.max(0, seconds) % duration) / duration) * atlas.columns) };
}
