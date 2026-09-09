import { writeFileSync } from 'node:fs';
import { game as g } from './load-game.mjs';

const types = ['militia', 'slinger', 'hatchling', 'medic', 'ballista'];
export function earlyArmy(ids, level = 1) {
  const s = g.newKingdom();
  s.buildings.barracks = 1;
  s.recruitCount.barracks = 2;
  ids.forEach((unitId, i) => {
    s.units[`copy-${i}`] = { unitId, investedXP: g.xpThreshold(level, unitId), locked: false };
    s.armySlots[i] = `copy-${i}`;
  });
  return s;
}

// Every class multiset obtainable by equipping five of the six copies from
// the guaranteed starter pack and a second tier-1 pack. Canonical slot order.
export const earlyRosters = [];
const seen = new Set();
for (let a = 0; a < 5; a++) for (let b = a; b < 5; b++) for (let c = b; c < 5; c++) {
  const six = [0, 1, 2, a, b, c];
  for (let omitted = 0; omitted < 6; omitted++) {
    const ids = six.filter((_, i) => i !== omitted).sort((x, y) => x - y).map(i => types[i]);
    const key = ids.join(',');
    if (!seen.has(key)) { seen.add(key); earlyRosters.push(ids); }
  }
}

export function measureEarly(ids, stage, { rules = g.CURRENT_RULES, playerDelay = 1, enemyPower, level = 1, peak = false } = {}) {
  let b = g.createBattle(earlyArmy(ids, level), stage);
  if (rules === 13) {
    b.config.rulesVersion = 13;
    b.config.slots = b.config.slots.map(u => u && g.unitStats(u.id, 1, 13, undefined, { ...g.initialUnitProgress(), level }));
  }
  b.config.slots.forEach((u, i) => {
    if (u) { u.spawnInterval *= playerDelay; b.nextSpawn[i] = u.spawnInterval; }
  });
  if (rules === 13 || enemyPower !== undefined) b.config.enemy.units = b.config.enemy.units.map(u => {
    const base = g.unitStats(u.id, 1, 13), power = enemyPower ?? 1;
    return { ...base, hp: Math.round(base.hp * power), damage: base.damage * power,
      healPerSecond: base.healPerSecond * power, healBudget: base.healBudget * power };
  });
  let peakFighters = 0;
  if (peak) {
    while (!b.result) { b = g.advanceBattle(b); peakFighters = Math.max(peakFighters, b.fighters.length); }
  } else b = g.advanceBattle(b, 1800);
  return { stage, units: ids, level, outcome: b.result, seconds: g.battleSeconds(b, b.elapsed),
    playerHp: Number(b.playerHp.toFixed(2)), enemyHp: Number(b.enemyHp.toFixed(2)), ...(peak ? { peakFighters } : {}) };
}

if (process.argv[1]?.endsWith('measure-early-balance.mjs')) {
  const sweep = [];
  for (const enemyPower of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5]) {
    const options = { rules: 13, playerDelay: 2, enemyPower };
    const battles = earlyRosters.map(ids => measureEarly(ids, 2, options));
    sweep.push({ enemyPower, wins: battles.filter(b => b.outcome === 'victory').length, rosters: battles.length,
      starter: measureEarly(types.slice(0, 3), 2, options).outcome });
  }
  const coverage = [];
  for (const [label, options] of [['previous', { rules: 13 }], ['delay only', { rules: 13, playerDelay: 2 }],
    ['current level 1', {}], ['current level 2', { level: 2 }], ['current level 3', { level: 3 }]]) {
    const battles = earlyRosters.map(ids => measureEarly(ids, 2, options));
    coverage.push({ label, wins: battles.filter(b => b.outcome === 'victory').length, rosters: battles.length });
  }
  const examples = [];
  for (const ids of [['militia'], types.slice(0, 3), types, ['militia', 'slinger', 'slinger', 'hatchling', 'ballista']]) {
    for (const stage of [1, 2, 5, 10, 11, 19]) for (const rules of [13, g.CURRENT_RULES]) {
      examples.push({ rules, ...measureEarly(ids, stage, { rules, peak: true }) });
    }
  }
  const progression = earlyRosters.map(ids => {
    let cleared = 0;
    while (cleared < 20 && measureEarly(ids, cleared + 1).outcome === 'victory') cleared++;
    return { units: ids, cleared };
  });
  console.table(sweep);
  console.table(coverage);
  console.log(`Furthest unupgraded roster: ${Math.max(...progression.map(r => r.cleared))} stages cleared.`);
  const report = { rules: g.CURRENT_RULES,
    assumptions: 'Keep 1, tier 1 level 1 unless listed, Balanced, no Forge/Library/Towers. Exhaustive legal five-slot class multisets after two packs, in canonical class order; counts are roster coverage, not win probabilities. Sweep uses rules 13 with doubled player recruitment and absolute enemy HP/damage/healing multipliers; enemy cadence is unchanged. Current examples use unmodified live configuration. Prior examples reconstruct rules-13 unit profiles. Progression reuses each roster without spending rewards; individual examples may skip ahead to the listed stage.',
    sweep, coverage, examples, progression };
  writeFileSync('docs/early-battle-balance.json', JSON.stringify(report, null, 2) + '\n');
}
