import { LEGACY_TAGS } from './legacyUnits.ts';
import balance from './game-balance.json' with { type: 'json' };
import type { Battle, Fighter } from './kingdom.ts';
import { UNIT_TAGS, classDamageMultiplier } from './units.ts';

export function rosterTarget(f: Fighter, fighters: readonly Fighter[]) {
    const enemies = fighters.filter(t => t.side !== f.side && t.hp > 0);
    const preferred = f.ability?.family === 'counter' ? enemies.filter(t => LEGACY_TAGS[t.kind]?.includes(f.ability!.targetTag!) && Math.abs(t.x - f.x) <= f.range) : [];
    return (preferred.length ? preferred : enemies).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x) || a.id - b.id)[0];
}

export function rosterHealingTarget(f: Fighter, fighters: readonly Fighter[]) {
    return fighters.filter(t => t.side === f.side && t.hp > 0 && !UNIT_TAGS[t.kind].includes('healer') && t.hp < t.maxHp && Math.abs(t.x - f.x) <= f.range)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
}

type CombatField = {
    damage: Map<number, number>;
    healing: Map<number, number>;
    positions: Map<number, number>;
    slows: Map<number, number>;
    rallies: Map<number, number>;
};

const newField = (): CombatField => ({
    damage: new Map(),
    healing: new Map(),
    positions: new Map(),
    slows: new Map(),
    rallies: new Map()
});

function hit(b: Battle, field: CombatField, source: Fighter, target: Fighter, amount: number, pierce = false) {
    const matchup = b.config.rulesVersion >= 7 ? classDamageMultiplier(source.kind, target.kind) : 1;
    const armor = pierce ? 1 : 1 - Math.min(balance.battle.armorCap, target.armor ?? 0);
    field.damage.set(target.id, (field.damage.get(target.id) ?? 0) + amount * matchup * armor);
}

function timing(b: Battle, f: Fighter, dt: number) {
    const overdue = b.config.rulesVersion >= 12 ? Math.max(0, dt - (f.cooldown ?? 0)) : 0;
    const pulses = b.config.rulesVersion >= 12 ? 1 + Math.floor(overdue / f.attackInterval!) : 1;
    const nextCooldown = b.config.rulesVersion >= 12 ? f.attackInterval! - overdue % f.attackInterval! : f.attackInterval!;
    return {
        pulses,
        nextCooldown
    };
}

function move(field: CombatField, b: Battle, f: Fighter, dt: number, remaining: number) {
    const direction = f.side === 'player' ? 1 : -1;
    const speed = f.speed * ((f.slowUntil ?? 0) > b.elapsed ? balance.battle.slowMultiplier : 1);
    field.positions.set(f.id, Math.max(0, Math.min(100, f.x + direction * Math.min(speed * dt, remaining))));
}

function heal(b: Battle, field: CombatField, f: Fighter, dt: number, distance: number, pulses: number, nextCooldown: number) {
    const ally = rosterHealingTarget(f, b.fighters);
    if (ally && (f.healingLeft ?? 0) > 0 && f.cooldown === 0) {
        const amount = Math.max(0, Math.min((f.healPerSecond ?? 0) * f.attackInterval! * pulses, f.healingLeft!, ally.maxHp - ally.hp - (field.healing.get(ally.id) ?? 0)));
        field.healing.set(ally.id, (field.healing.get(ally.id) ?? 0) + amount);
        f.healingLeft! -= amount;
        f.cooldown = nextCooldown;
        f.attackCount! += pulses;
        f.lastAttackAt = b.elapsed;
        f.lastTarget = ally.id;
        f.lastTargetX = ally.x;
    } else if (!ally && distance > f.range) {
        move(field, b, f, dt, distance - f.range);
    }
}

function pierceBehind(b: Battle, field: CombatField, f: Fighter, target: Fighter, amount: number) {
    const direction = f.side === 'player' ? 1 : -1;
    const behind = b.fighters.filter(t => t.side !== f.side && t.id !== target.id && (t.x - target.x) * direction >= 0 && Math.abs(t.x - target.x) <= f.ability!.radius!)
        .sort((x, y) => Math.abs(x.x - target.x) - Math.abs(y.x - target.x) || x.id - y.id).slice(0, f.ability!.targets);
    for (const other of behind) {
        hit(b, field, f, other, amount, true);
    }
}

function splashNearby(b: Battle, field: CombatField, f: Fighter, target: Fighter, amount: number) {
    const nearby = b.fighters.filter(t => t.side !== f.side && t.id !== target.id && Math.abs(t.x - target.x) <= f.splashRadius!)
        .sort((x, y) => Math.abs(x.x - target.x) - Math.abs(y.x - target.x) || x.id - y.id).slice(0, f.ability!.targets);
    for (const other of nearby) {
        hit(b, field, f, other, amount * f.splashFraction!);
    }
}

function strikeTarget(b: Battle, field: CombatField, f: Fighter, target: Fighter, amount: number) {
    const ability = f.ability!;
    if (ability.family === 'counter' && LEGACY_TAGS[target.kind]?.includes(ability.targetTag!)) {
        amount *= ability.multiplier!;
    }

    if (ability.family === 'execute' && target.hp < target.maxHp / 2) {
        amount *= ability.multiplier!;
    }

    const piercing = ability.family === 'pierce' && f.attackCount! % ability.every! === 0;
    hit(b, field, f, target, amount, piercing);
    if (piercing && ability.targets) {
        pierceBehind(b, field, f, target, amount);
    }

    if (ability.family === 'splash') {
        splashNearby(b, field, f, target, amount);
    }

    if (ability.family === 'slow') {
        field.slows.set(target.id, b.elapsed + ability.duration!);
    }
}

function rallyNearby(b: Battle, field: CombatField, f: Fighter) {
    const allies = b.fighters.filter(t => t.side === f.side && !UNIT_TAGS[t.kind].includes('support') && Math.abs(t.x - f.x) <= f.ability!.radius!)
        .sort((x, y) => Math.abs(x.x - f.x) - Math.abs(y.x - f.x) || x.id - y.id).slice(0, f.ability!.targets);
    for (const ally of allies) {
        field.rallies.set(ally.id, b.elapsed + f.ability!.duration!);
    }
}

function attack(b: Battle, field: CombatField, f: Fighter, target: Fighter | undefined, distance: number, pulses: number, nextCooldown: number) {
    f.attackCount! += pulses;
    f.lastAttackAt = b.elapsed;
    f.lastTarget = target && distance <= f.range ? target.id : 0;
    f.lastTargetX = target && distance <= f.range ? target.x : f.side === 'player' ? 100 : 0;
    f.cooldown = nextCooldown;
    let amount = f.damage * (f.damagePeriod ?? f.attackInterval!) * pulses * ((f.rallyUntil ?? 0) > b.elapsed ? balance.battle.rallyMultiplier : 1);
    if (f.ability!.family === 'charge' && f.attackCount === 1) {
        amount *= f.ability!.multiplier!;
    }

    if (target && distance <= f.range) {
        strikeTarget(b, field, f, target, amount);
    } else if (f.side === 'player') {
        b.enemyHp -= amount * f.castleMultiplier;
    } else {
        b.playerHp -= amount * f.castleMultiplier;
    }

    if (f.ability!.family === 'rally') {
        rallyNearby(b, field, f);
    }
}

function attackOrMove(b: Battle, field: CombatField, f: Fighter, dt: number, target: Fighter | undefined, distance: number, pulses: number, nextCooldown: number) {
    const castleInRange = Math.abs((f.side === 'player' ? 100 : 0) - f.x) <= f.range;
    if ((target && distance <= f.range) || castleInRange) {
        if (f.cooldown! > 0) {
            return;
        }

        attack(b, field, f, target, distance, pulses, nextCooldown);
    } else {
        move(field, b, f, dt, Math.max(0, distance - 2));
    }
}

function resolveFighter(b: Battle, field: CombatField, f: Fighter, dt: number) {
    const target = rosterTarget(f, b.fighters);
    const distance = target ? Math.abs(target.x - f.x) : Infinity;
    const { pulses, nextCooldown } = timing(b, f, dt);
    f.cooldown = Math.max(0, (f.cooldown ?? 0) - dt);
    if (f.ability!.family === 'heal') {
        heal(b, field, f, dt, distance, pulses, nextCooldown);
    } else {
        attackOrMove(b, field, f, dt, target, distance, pulses, nextCooldown);
    }
}

function applyEffects(field: CombatField, f: Fighter): Fighter {
    const hp = f.hp - (field.damage.get(f.id) ?? 0);
    return {
        ...f,
        hp: hp <= 0 ? hp : Math.min(f.maxHp, hp + (field.healing.get(f.id) ?? 0)),
        x: field.positions.get(f.id) ?? f.x,
        slowUntil: Math.max(f.slowUntil ?? 0, field.slows.get(f.id) ?? 0),
        rallyUntil: Math.max(f.rallyUntil ?? 0, field.rallies.get(f.id) ?? 0)
    };
}

/** Resolve all decisions against the same field, then apply their effects together. */
export function resolveRosterCombat(b: Battle, dt: number) {
    const field = newField();
    for (const fighter of b.fighters) {
        resolveFighter(b, field, fighter, dt);
    }

    b.fighters = b.fighters.map(f => applyEffects(field, f)).filter(f => f.hp > 0);
}
