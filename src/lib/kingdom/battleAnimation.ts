import { Battle, BuildingId, Fighter, nearestOpponent } from './game';

export const ATTACK_SECONDS: Record<BuildingId, number> = { barracks: 0.8, range: 1.2, stable: 0.8, workshop: 2 };
export type Pose = 'idle' | 'walk' | 'attack';
export interface VisualUnit {
  fighter: Fighter;
  from: number;
  to: number;
  pose: Pose;
  targetX: number;
  targetId?: number;
}

export function interpolateX(unit: VisualUnit, progress: number) {
  return unit.from + (unit.to - unit.from) * Math.max(0, Math.min(1, progress));
}

// Visual intent uses the same targeting precedence as combat. It never deals
// damage or predicts an outcome; the authoritative snapshots still own both.
export function visualUnits(battle: Battle, previous: readonly VisualUnit[], progress: number): VisualUnit[] {
  const old = new Map(previous.map(unit => [unit.fighter.id, unit]));
  return battle.fighters.map(fighter => {
    const prior = old.get(fighter.id);
    const from = prior ? interpolateX(prior, progress) : fighter.x;
    const target = nearestOpponent(fighter, battle.fighters);
    const castleX = fighter.side === 'player' ? 100 : 0;
    const attacksUnit = !!target && Math.abs(target.x - fighter.x) <= fighter.range;
    const attacksCastle = !attacksUnit && Math.abs(castleX - fighter.x) <= fighter.range;
    return {
      fighter, from, to: fighter.x,
      pose: battle.result ? 'idle' : attacksUnit || attacksCastle ? 'attack' : 'walk',
      targetX: attacksUnit ? target!.x : castleX,
      targetId: attacksUnit ? target!.id : undefined,
    };
  });
}

// Tiny Swords uses six frames for idle/run even in the eight-column archer
// sheet. Horizontal attacks are row 2 for warriors and row 4 for archers.
export function spriteFrame(kind: BuildingId, pose: Pose, seconds: number, reducedMotion = false) {
  if (reducedMotion) return { row: 0, column: 0 };
  const archer = kind === 'range';
  const frames = pose === 'attack' && archer ? 8 : 6;
  const duration = pose === 'attack' ? ATTACK_SECONDS[kind] : 0.8;
  return {
    row: pose === 'attack' ? (archer ? 4 : 2) : pose === 'walk' ? 1 : 0,
    column: Math.floor((seconds % duration) / duration * frames),
  };
}

export function projectilePosition(fromX: number, fromY: number, toX: number, toY: number, progress: number, arc: number) {
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: fromX + (toX - fromX) * t,
    y: fromY + (toY - fromY) * t - 4 * arc * t * (1 - t),
    angle: Math.atan2(toY - fromY - 4 * arc * (1 - 2 * t), toX - fromX),
  };
}
