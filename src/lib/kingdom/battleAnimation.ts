import { Battle, BuildingId, Fighter, nearestOpponent } from './game';

export const ATTACK_SECONDS: Record<BuildingId, number> = { barracks: 0.8, range: 1.2, stable: 0.8, workshop: 2 };
export const STALE_BATTLE_SECONDS = 3;
export type Pose = 'idle' | 'walk' | 'attack';
export interface VisualUnit {
  fighter: Fighter;
  from: number;
  to: number;
  pose: Pose;
  targetX: number;
  targetId?: number;
  velocity: number;
  stopX: number;
}

// Continue at walking speed through ordinary polling/network jitter. During a
// genuine outage, coast to a stop over the final second of the prediction window.
export function predictionTime(age: number) {
  const seconds = Math.max(0, age);
  const coast = Math.max(0, Math.min(1, seconds - (STALE_BATTLE_SECONDS - 1)));
  return Math.min(seconds, STALE_BATTLE_SECONDS - 1) + coast - coast * coast / 2;
}

export function motionX(unit: VisualUnit, age: number) {
  const seconds = Math.max(0, age);
  const travel = unit.velocity * predictionTime(seconds);
  const error = unit.from - unit.to;
  // Reconcile from the displayed position. While marching, correction can only
  // add/subtract half walking speed, avoiding both teleports and backward steps.
  const correctionSpeed = unit.fighter.speed * (unit.pose === 'walk' ? 0.5 : 2);
  const correction = Math.sign(error) * Math.max(0, Math.abs(error) - correctionSpeed * seconds);
  const x = unit.to + travel + correction;
  const bounded = unit.velocity > 0 ? Math.min(x, unit.stopX) : unit.velocity < 0 ? Math.max(x, unit.stopX) : x;
  return Math.max(0, Math.min(100, bounded));
}

// Visual intent uses the same targeting precedence as combat. It never deals
// damage or predicts an outcome; the authoritative snapshots still own both.
export function visualUnits(battle: Battle, previous: readonly VisualUnit[], age: number): VisualUnit[] {
  const old = new Map(previous.map(unit => [unit.fighter.id, unit]));
  const opponents = new Map<number, Fighter>();
  const units: VisualUnit[] = battle.fighters.map(fighter => {
    const prior = old.get(fighter.id);
    const from = prior ? motionX(prior, age) : fighter.x;
    const target = nearestOpponent(fighter, battle.fighters);
    if (target) opponents.set(fighter.id, target);
    const castleX = fighter.side === 'player' ? 100 : 0;
    const attacksUnit = !!target && Math.abs(target.x - fighter.x) <= fighter.range;
    const attacksCastle = !attacksUnit && Math.abs(castleX - fighter.x) <= fighter.range;
    const pose = battle.result ? 'idle' : attacksUnit || attacksCastle ? 'attack' : 'walk';
    return {
      fighter, from, to: fighter.x,
      pose,
      targetX: attacksUnit ? target!.x : castleX,
      targetId: attacksUnit ? target!.id : undefined,
      velocity: pose === 'walk' ? fighter.speed * (fighter.side === 'player' ? 1 : -1) : 0,
      stopX: fighter.side === 'player' ? Math.max(from, 100 - fighter.range) : Math.min(from, fighter.range),
    };
  });
  const byId = new Map(units.map(unit => [unit.fighter.id, unit]));
  for (const unit of units) {
    const target = opponents.get(unit.fighter.id);
    if (!target) continue;
    const opponent = byId.get(target.id)!;
    if ((opponent.from - unit.from) * unit.velocity <= 0) continue;
    // Reserve the opponent's share of the closing distance too, so predicted
    // armies cannot cross. Attacks, health, spawns and outcomes remain server-owned.
    const closingSpeed = unit.fighter.speed + Math.abs(opponent.velocity);
    // Use displayed positions, including reconciliation offsets. Using only
    // server positions could let a correcting unit overlap an oncoming enemy.
    const gap = Math.max(0, Math.abs(opponent.from - unit.from) - unit.fighter.range);
    const stop = unit.from + Math.sign(unit.velocity) * gap * unit.fighter.speed / closingSpeed;
    unit.stopX = unit.velocity > 0 ? Math.min(unit.stopX, stop) : Math.max(unit.stopX, stop);
  }
  return units;
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
