import { KNOWLEDGE_RESOURCES, type KnowledgeResourceKey } from './resources.ts';
import balance from './game-balance.json' with { type: 'json' };
import type { EffectiveUnit, Kingdom } from './kingdom.ts';

export const TOWER_RULE = 'earned-proficiency-v1' as const;
export const TOWER_SCALE = balance.tower.scale;
export const TOWER_THRESHOLDS = balance.tower.thresholds;
export interface TowerProgress {
    rule: typeof TOWER_RULE;
    points: Record<KnowledgeResourceKey, number>
}
export const emptyTowers = (): TowerProgress => ({
    rule: TOWER_RULE,
    points: Object.fromEntries(KNOWLEDGE_RESOURCES.map(r => [r.key, 0])) as TowerProgress['points']
});
export const towerLevel = (points: number) => TOWER_THRESHOLDS.filter(n => points >= n * TOWER_SCALE).length;
const percent = (n: number) => Number((n * 100).toFixed(2));
const identities = {
    force: ['Force Tower', 'Battlements'],
    runes: ['Logic Tower', 'Diamond spire'],
    reagents: ['Alchemy Tower', 'Triangular furnace'],
    essence: ['Life Tower', 'Flower canopy'],
    cores: ['Computation Tower', 'Lightning antenna'],
    astral: ['Astral Tower', 'Star observatory'],
    insight: ['Insight Tower', 'Circular eye'],
    influence: ['Command Tower', 'Crown pavilion'],
} as const;
export const TOWERS = KNOWLEDGE_RESOURCES.map(r => ({
    ...r,
    id: `tower-${r.key}`,
    name: identities[r.key][0],
    appearance: identities[r.key][1],
    thresholds: TOWER_THRESHOLDS,
    cap: balance.tower.maxLevel
}));
export function towerEffect(key: KnowledgeResourceKey, level: number): string {
    const l = Math.max(0, Math.min(balance.tower.maxLevel, level));
    switch (key) {
        case 'force': return `Melee, swarm & siege: +${percent(balance.tower.forceDamage * l)}% damage; +${percent(balance.tower.forceArmor * l)} percentage points armor`;
        case 'runes': return `Attackers: +${percent(balance.tower.runesDamage * l)}% precision damage; +${percent(balance.tower.runesKeep * l)}% Keep damage`;
        case 'reagents': return `Siege: +${percent(balance.tower.reagentsDamage * l)}% damage; +${percent(balance.tower.reagentsSplash * l)} percentage points splash`;
        case 'essence': return `All: +${percent(balance.tower.essenceHp * l)}% HP; healers: +${percent(balance.tower.essenceHealing * l)}% healing and budget`;
        case 'cores': return `All: +${percent(balance.tower.coresRecruitment * l)}% recruitment rate`;
        case 'astral': return `Ranged: +${percent(balance.tower.astralRange * l)}% reach`;
        case 'insight': return `Melee, ranged, swarm & healers: +${percent(balance.tower.insightSpeed * l)}% movement speed`;
        case 'influence': return `Attackers: +${percent(balance.tower.influenceKeep * l)}% Keep damage`;
    }
}

import { UNIT_TAGS } from './units.ts';
export { UNIT_TAGS } from './units.ts';
export const towerLevels = (progress: TowerProgress) => Object.fromEntries(TOWERS.map(t => [t.key, towerLevel(progress.points[t.key])])) as Record<KnowledgeResourceKey, number>;
const rounded = (n: number) => Number(n.toFixed(6));
const boosted = (base: number, bonus: number) => bonus ? rounded(base * (1 + bonus)) : base;
/** Applied once after building stats. No random rolls: precision is deterministic throughput. */
export function applyTowerModifiers(unit: EffectiveUnit, progress: TowerProgress): EffectiveUnit {
    const l = towerLevels(progress), tags = UNIT_TAGS[unit.id];
    const has = (tag: string) => tags.includes(tag);
    const damage = 1 + (has('heavy') ? balance.tower.forceDamage * l.force : 0) + (has('siege') ? balance.tower.reagentsDamage * l.reagents : 0)
    + (has('attacker') ? balance.tower.runesDamage * l.runes : 0);
    return {
        ...unit,
        hp: boosted(unit.hp, balance.tower.essenceHp * l.essence),
        damage: boosted(unit.damage, damage - 1),
        armor: rounded(Math.min(balance.battle.armorCap, (unit.armor ?? 0) + (has('heavy') ? balance.tower.forceArmor * l.force : 0))),
        castleMultiplier: rounded(unit.castleMultiplier * (1 + (has('attacker') ? balance.tower.runesKeep * l.runes + balance.tower.influenceKeep * l.influence : 0))),
        splashFraction: rounded(Math.min(balance.battle.armorCap, (unit.splashFraction ?? 0) + (has('siege') ? balance.tower.reagentsSplash * l.reagents : 0))),
        healPerSecond: rounded((unit.healPerSecond ?? 0) * (1 + balance.tower.essenceHealing * l.essence)),
        healBudget: rounded((unit.healBudget ?? 0) * (1 + balance.tower.essenceHealing * l.essence)),
        spawnInterval: rounded(Math.max(.25, unit.spawnInterval / (1 + balance.tower.coresRecruitment * l.cores))),
        range: rounded(Math.min(100, unit.range * (1 + (has('ranged') ? balance.tower.astralRange * l.astral : 0)))),
        speed: Math.min(100, boosted(unit.speed, has('mobile') ? balance.tower.insightSpeed * l.insight : 0)),
    };
}

export const effectiveTowerUnit = (unit: EffectiveUnit, state: Kingdom) => applyTowerModifiers(unit, state.towers);
