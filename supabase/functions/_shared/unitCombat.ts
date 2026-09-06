import type { Battle, Fighter } from './kingdom.ts';
import { UNIT_TAGS } from './units.ts';

export function rosterTarget(f: Fighter, fighters: readonly Fighter[]) {
  const enemies = fighters.filter(t => t.side !== f.side && t.hp > 0);
  const preferred = f.ability?.family === 'counter' ? enemies.filter(t => UNIT_TAGS[t.kind].includes(f.ability!.targetTag!) && Math.abs(t.x - f.x) <= f.range) : [];
  return (preferred.length ? preferred : enemies).sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x) || a.id - b.id)[0];
}
export function rosterHealingTarget(f: Fighter, fighters: readonly Fighter[]) {
  return fighters.filter(t => t.side === f.side && t.hp > 0 && !UNIT_TAGS[t.kind].includes('healer') && t.hp < t.maxHp && Math.abs(t.x - f.x) <= f.range)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
}

/** Rules 5: all decisions read the same living field. Apply damage, then capped
 * healing (lethal damage wins), movement, and non-stacking statuses together.
 * Cooldowns, shot counts, budgets and expiry times are part of the snapshot.
 * No random choices or animation callbacks participate in combat. */
export function resolveRosterCombat(b: Battle, dt: number) {
  const damage = new Map<number, number>(), healing = new Map<number, number>(), positions = new Map<number, number>();
  const slows = new Map<number, number>(), rallies = new Map<number, number>();
  const hit = (target: Fighter, amount: number, pierce = false) => damage.set(target.id,
    (damage.get(target.id) ?? 0) + amount * (pierce ? 1 : 1 - Math.min(.5, target.armor ?? 0)));
  for (const f of b.fighters) {
    const a = f.ability!;
    const direction = f.side === 'player' ? 1 : -1;
    const target = rosterTarget(f, b.fighters);
    const distance = target ? Math.abs(target.x - f.x) : Infinity;
    f.cooldown = Math.max(0, (f.cooldown ?? 0) - dt);
    if (a.family === 'heal') {
      const ally = rosterHealingTarget(f, b.fighters);
      if (ally && (f.healingLeft ?? 0) > 0 && f.cooldown === 0) {
        const amount = Math.max(0, Math.min((f.healPerSecond ?? 0) * f.attackInterval!, f.healingLeft!, ally.maxHp - ally.hp - (healing.get(ally.id) ?? 0)));
        healing.set(ally.id, (healing.get(ally.id) ?? 0) + amount); f.healingLeft! -= amount;
        f.cooldown = f.attackInterval!; f.attackCount!++; f.lastAttackAt = b.elapsed; f.lastTarget = ally.id; f.lastTargetX = ally.x;
      } else if (!ally && distance > f.range) positions.set(f.id, Math.max(0, Math.min(100, f.x + direction * Math.min(f.speed * ((f.slowUntil ?? 0) > b.elapsed ? .7 : 1) * dt, distance - f.range))));
      continue;
    }
    const castleInRange = Math.abs((f.side === 'player' ? 100 : 0) - f.x) <= f.range;
    if ((target && distance <= f.range) || castleInRange) {
      if (f.cooldown! > 0) continue;
      f.attackCount!++; f.lastAttackAt = b.elapsed; f.lastTarget = target && distance <= f.range ? target.id : 0;
      f.lastTargetX = target && distance <= f.range ? target.x : f.side === 'player' ? 100 : 0;
      f.cooldown = f.attackInterval!;
      let amount = f.damage * (f.damagePeriod ?? f.attackInterval!) * ((f.rallyUntil ?? 0) > b.elapsed ? 1.15 : 1);
      if (a.family === 'charge' && f.attackCount === 1) amount *= a.multiplier!;
      if (target && distance <= f.range) {
        if (a.family === 'counter' && UNIT_TAGS[target.kind].includes(a.targetTag!)) amount *= a.multiplier!;
        if (a.family === 'execute' && target.hp < target.maxHp / 2) amount *= a.multiplier!;
        const piercing = a.family === 'pierce' && f.attackCount! % a.every! === 0;
        hit(target, amount, piercing);
        if (piercing && a.targets) {
          const behind = b.fighters.filter(t => t.side !== f.side && t.id !== target.id && (t.x - target.x) * direction >= 0 && Math.abs(t.x - target.x) <= a.radius!)
            .sort((x, y) => Math.abs(x.x - target.x) - Math.abs(y.x - target.x) || x.id - y.id).slice(0, a.targets);
          for (const t of behind) hit(t, amount, true);
        }
        if (a.family === 'splash') {
          const nearby = b.fighters.filter(t => t.side !== f.side && t.id !== target.id && Math.abs(t.x - target.x) <= f.splashRadius!)
            .sort((x, y) => Math.abs(x.x - target.x) - Math.abs(y.x - target.x) || x.id - y.id).slice(0, a.targets);
          for (const t of nearby) hit(t, amount * f.splashFraction!);
        }
        if (a.family === 'slow') slows.set(target.id, b.elapsed + a.duration!);
      } else if (f.side === 'player') b.enemyHp -= amount * f.castleMultiplier;
      else b.playerHp -= amount * f.castleMultiplier;
      if (a.family === 'rally') {
        for (const ally of b.fighters.filter(t => t.side === f.side && !UNIT_TAGS[t.kind].includes('support') && Math.abs(t.x - f.x) <= a.radius!)
          .sort((x, y) => Math.abs(x.x - f.x) - Math.abs(y.x - f.x) || x.id - y.id).slice(0, a.targets)) rallies.set(ally.id, b.elapsed + a.duration!);
      }
    } else {
      const speed = f.speed * ((f.slowUntil ?? 0) > b.elapsed ? .7 : 1);
      positions.set(f.id, Math.max(0, Math.min(100, f.x + direction * Math.min(speed * dt, Math.max(0, distance - 2)))));
    }
  }
  b.fighters = b.fighters.map(f => {
    const hp = f.hp - (damage.get(f.id) ?? 0);
    return { ...f, hp: hp <= 0 ? hp : Math.min(f.maxHp, hp + (healing.get(f.id) ?? 0)), x: positions.get(f.id) ?? f.x,
      slowUntil: Math.max(f.slowUntil ?? 0, slows.get(f.id) ?? 0), rallyUntil: Math.max(f.rallyUntil ?? 0, rallies.get(f.id) ?? 0) };
  }).filter(f => f.hp > 0);
}
