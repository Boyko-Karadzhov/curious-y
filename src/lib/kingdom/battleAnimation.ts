import { rosterTarget, rosterHealingTarget } from '../../../supabase/functions/_shared/unitCombat';
import { Battle, battleSpeed, UnitId, Fighter, nearestOpponent, healingTarget, UNITS } from './game';

export const ATTACK_SECONDS: Record<UnitId, number> = { ...Object.fromEntries(UNITS.map(u => [u.id, u.ability.interval])), swordsman:.8, archer:1.2, knight:.8, catapult:2, medic:1 } as Record<UnitId, number>;
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
  playbackSpeed?: number;
  interpolationSeconds?: number;
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
    if (unit.interpolationSeconds !== undefined) {
        const t = Math.min(1, seconds / unit.interpolationSeconds);
        return unit.from + (unit.to - unit.from) * t;
    }

    const travel = unit.velocity * predictionTime(seconds);
    const error = unit.from - unit.to;
    // Reconcile from the displayed position. While marching, correction can only
    // add/subtract half walking speed, avoiding both teleports and backward steps.
    const correctionSpeed = unit.fighter.speed * (unit.playbackSpeed ?? 1) * (unit.pose === 'walk' ? 0.5 : 2);
    const correction = Math.sign(error) * Math.max(0, Math.abs(error) - correctionSpeed * seconds);
    const x = unit.to + travel + correction;
    const bounded = unit.velocity > 0 ? Math.min(x, unit.stopX) : unit.velocity < 0 ? Math.max(x, unit.stopX) : x;
    return Math.max(0, Math.min(100, bounded));
}

// Visual intent uses the same targeting precedence as combat. It never deals
// damage or predicts an outcome; the authoritative snapshots still own both.
export function visualUnits(battle: Battle, previous: readonly VisualUnit[], age: number): VisualUnit[] {
    const old = new Map(previous.map(unit => [unit.fighter.id, unit]));
    const playbackSpeed = battleSpeed(battle.config.rulesVersion);
    const opponents = new Map<number, Fighter>();
    const units: VisualUnit[] = battle.fighters.map(fighter => {
        const prior = old.get(fighter.id);
        const from = prior ? motionX(prior, age) : fighter.x;
        const target = battle.config.rulesVersion >= 5 ? rosterTarget(fighter, battle.fighters) : nearestOpponent(fighter, battle.fighters);
        if (fighter.ability?.family === 'heal' || fighter.kind === 'medic') {
            const ally = (fighter.healingLeft ?? 0) > 0 ? (battle.config.rulesVersion >= 5 ? rosterHealingTarget(fighter, battle.fighters) : healingTarget(fighter, battle.fighters)) : undefined;
            const walking = !ally && (!target || Math.abs(target.x - fighter.x) > fighter.range);
            return { fighter, playbackSpeed, from, to: fighter.x, pose: battle.result ? 'idle' : ally ? 'attack' : walking ? 'walk' : 'idle',
                targetX: ally?.x ?? fighter.x, targetId: ally?.id,
                velocity: !battle.result && walking ? fighter.speed * playbackSpeed * (fighter.side === 'player' ? 1 : -1) : 0,
                stopX: target ? target.x + (fighter.side === 'player' ? -fighter.range : fighter.range) : fighter.side === 'player' ? 100 : 0 };
        }

        if (target) {
            opponents.set(fighter.id, target);
        }

        const castleX = fighter.side === 'player' ? 100 : 0;
        const attacksUnit = !!target && Math.abs(target.x - fighter.x) <= fighter.range;
        const attacksCastle = !attacksUnit && Math.abs(castleX - fighter.x) <= fighter.range;
        const pose = battle.result ? 'idle' : attacksUnit || attacksCastle ? 'attack' : 'walk';
        return {
            fighter, playbackSpeed, from, to: fighter.x,
            pose,
            targetX: target && !attacksCastle ? target.x : castleX,
            targetId: target && !attacksCastle ? target.id : undefined,
            velocity: pose === 'walk' ? fighter.speed * playbackSpeed * (fighter.side === 'player' ? 1 : -1) : 0,
            stopX: fighter.side === 'player' ? Math.max(from, 100 - fighter.range) : Math.min(from, fighter.range),
        };
    });
    const byId = new Map(units.map(unit => [unit.fighter.id, unit]));
    for (const unit of units) {
        const target = opponents.get(unit.fighter.id);
        if (!target) {
            continue;
        }

        const opponent = byId.get(target.id)!;
        if ((opponent.from - unit.from) * unit.velocity <= 0) {
            continue;
        }

        // Reserve the opponent's share of the closing distance too, so predicted
        // armies cannot cross. Attacks, health, spawns and outcomes remain server-owned.
        const closingSpeed = Math.abs(unit.velocity) + Math.abs(opponent.velocity);
        // Use displayed positions, including reconciliation offsets. Using only
        // server positions could let a correcting unit overlap an oncoming enemy.
        const gap = Math.max(0, Math.abs(opponent.from - unit.from) - unit.fighter.range);
        const stop = unit.from + Math.sign(unit.velocity) * gap * Math.abs(unit.velocity) / closingSpeed;
        unit.stopX = unit.velocity > 0 ? Math.min(unit.stopX, stop) : Math.max(unit.stopX, stop);
    }

    if (battle.id) {
    // Local playback supplies every fixed step. Interpolate known positions
    // for one step instead of predicting movement, contact or attacks.
        for (const unit of units) {
            unit.from = old.get(unit.fighter.id)?.fighter.x ?? unit.fighter.x;
            unit.velocity = 0;
            unit.interpolationSeconds = battle.config.stepSeconds / playbackSpeed;
        }
    }

    return units;
}

// Prediction can reach the frontline before the next server snapshot. Change
// pose on that same rendered frame instead of walking in place at the stop.
// This is visual intent only; hits and cooldowns remain authoritative.
export function visualIntent(unit: VisualUnit, age: number, units: readonly VisualUnit[]): Pick<VisualUnit, 'pose' | 'targetId' | 'targetX'> {
    if (unit.interpolationSeconds !== undefined) {
        return unit;
    }

    if (unit.pose !== 'walk') {
        return unit;
    }

    const x = motionX(unit, age);
    const target = units.find(other => other.fighter.id === unit.targetId);
    const targetX = target ? motionX(target, age) : unit.targetX;
    if (unit.fighter.ability?.family !== 'heal' && unit.fighter.kind !== 'medic') {
        if (target && Math.abs(targetX - x) <= unit.fighter.range + 0.001) {
            return { pose: 'attack', targetId: target.fighter.id, targetX };
        }

        const castleX = unit.fighter.side === 'player' ? 100 : 0;
        if (Math.abs(castleX - x) <= unit.fighter.range + 0.001) {
            return { pose: 'attack', targetX: castleX };
        }
    }

    const stopped = Math.abs(x - unit.stopX) <= 0.001 || age >= STALE_BATTLE_SECONDS;
    return { pose: stopped ? 'idle' : 'walk', targetId: unit.targetId, targetX };
}

// Tiny Swords uses six frames for idle/run even in the eight-column archer
// sheet. Horizontal attacks are row 2 for warriors and row 4 for archers.
export function spriteFrame(kind: UnitId, pose: Pose, seconds: number, reducedMotion = false) {
    if (reducedMotion) {
        return { row: 0, column: 0 };
    }

    const archer = kind === 'archer';
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
