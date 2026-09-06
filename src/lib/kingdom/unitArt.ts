import { UnitId, UNITS } from './game';

export interface UnitArt {
  portrait: string;
  atlas?: { src: string; columns: number; rows: number; frameSize: number; anchorX: number; anchorY: number };
}

// Presentation belongs here, outside combat/save definitions. Every surface
// resolves a unit through this registry, and portraits come from approved poses.
const generated: Partial<Record<UnitId, UnitArt>> = {
  swordsman: {
    portrait: '/assets/units/swordsman-v1/portrait.png',
    atlas: { src: '/assets/units/swordsman-v1/atlas.png', columns: 4, rows: 3, frameSize: 256, anchorX: 112 / 256, anchorY: 232 / 256 },
  },
};

export function unitArt(id: UnitId): UnitArt {
  return generated[id] ?? { portrait: UNITS.find(unit => unit.id === id)!.asset };
}

export function unitArtFrame(id: UnitId, pose: 'idle' | 'walk' | 'attack', seconds: number, attackSeconds: number, reducedMotion = false) {
  const atlas = unitArt(id).atlas;
  if (!atlas || reducedMotion) return { row: 0, column: 0 };
  const duration = pose === 'attack' ? attackSeconds : pose === 'walk' ? .8 : 1.2;
  return { row: pose === 'attack' ? 2 : pose === 'walk' ? 1 : 0,
    column: Math.floor(((Math.max(0, seconds) % duration) / duration) * atlas.columns) };
}
