import { KNOWLEDGE_RESOURCES, type KnowledgeResourceKey } from './resources.ts';
import type { EffectiveUnit, Kingdom } from './kingdom.ts';

export const TOWER_RULE = 'earned-proficiency-v1' as const;
export const TOWER_SCALE = 1_000_000;
export const TOWER_THRESHOLDS = [1, 3, 6, 10, 15] as const;
export interface TowerProgress { rule: typeof TOWER_RULE; points: Record<KnowledgeResourceKey, number> }
export const emptyTowers = (): TowerProgress => ({ rule: TOWER_RULE,
    points: Object.fromEntries(KNOWLEDGE_RESOURCES.map(r => [r.key, 0])) as TowerProgress['points'] });
export const towerLevel = (points: number) => TOWER_THRESHOLDS.filter(n => points >= n * TOWER_SCALE).length;
const percent = (n: number) => Number((n * 100).toFixed(2));
const identities = {
    force: ['Force Tower', 'Battlements'], runes: ['Logic Tower', 'Diamond spire'],
    reagents: ['Alchemy Tower', 'Triangular furnace'], essence: ['Life Tower', 'Flower canopy'],
    cores: ['Computation Tower', 'Lightning antenna'], astral: ['Astral Tower', 'Star observatory'],
    insight: ['Insight Tower', 'Circular eye'], influence: ['Command Tower', 'Crown pavilion'],
} as const;
export const TOWERS = KNOWLEDGE_RESOURCES.map(r => ({ ...r, id: `tower-${r.key}`, name: identities[r.key][0],
    appearance: identities[r.key][1], thresholds: TOWER_THRESHOLDS, cap: 5 }));
export function towerEffect(key: KnowledgeResourceKey, level: number): string {
    const l = Math.max(0, Math.min(5, level));
    switch (key) {
        case 'force': return `Melee, swarm & siege: +${percent(.005 * l)}% damage; +${percent(.003 * l)} percentage points armor`;
        case 'runes': return `Attackers: +${percent(.004 * l)}% precision damage; +${percent(.002 * l)}% Keep damage`;
        case 'reagents': return `Siege: +${percent(.005 * l)}% damage; +${percent(.004 * l)} percentage points splash`;
        case 'essence': return `All: +${percent(.005 * l)}% HP; healers: +${percent(.004 * l)}% healing and budget`;
        case 'cores': return `All: +${percent(.004 * l)}% recruitment rate`;
        case 'astral': return `Ranged: +${percent(.005 * l)}% reach`;
        case 'insight': return `Melee, ranged, swarm & healers: +${percent(.005 * l)}% movement speed`;
        case 'influence': return `Attackers: +${percent(.003 * l)}% Keep damage`;
    }
}

import { UNIT_TAGS } from './units.ts';
export { UNIT_TAGS } from './units.ts';
export const towerLevels = (progress: TowerProgress) => Object.fromEntries(TOWERS.map(t => [t.key, towerLevel(progress.points[t.key])])) as Record<KnowledgeResourceKey, number>;
const rounded = (n: number) => Number(n.toFixed(6));
const boosted = (base: number, bonus: number) => bonus ? rounded(base * (1 + bonus)) : base;
/** Applied once AFTER building/Library stats. No random rolls: precision is deterministic throughput. */
export function applyTowerModifiers(unit: EffectiveUnit, progress: TowerProgress): EffectiveUnit {
    const l = towerLevels(progress), tags = UNIT_TAGS[unit.id];
    const has = (tag: string) => tags.includes(tag);
    const damage = 1 + (has('heavy') ? .005 * l.force : 0) + (has('siege') ? .005 * l.reagents : 0)
    + (has('attacker') ? .004 * l.runes : 0);
    return { ...unit, hp: boosted(unit.hp, .005 * l.essence), damage: boosted(unit.damage, damage - 1),
        armor: rounded(Math.min(.5, (unit.armor ?? 0) + (has('heavy') ? .003 * l.force : 0))),
        castleMultiplier: rounded(unit.castleMultiplier * (1 + (has('attacker') ? .002 * l.runes + .003 * l.influence : 0))),
        splashFraction: rounded(Math.min(.5, (unit.splashFraction ?? 0) + (has('siege') ? .004 * l.reagents : 0))),
        healPerSecond: rounded((unit.healPerSecond ?? 0) * (1 + .004 * l.essence)),
        healBudget: rounded((unit.healBudget ?? 0) * (1 + .004 * l.essence)),
        spawnInterval: rounded(Math.max(.25, unit.spawnInterval / (1 + .004 * l.cores))),
        range: rounded(Math.min(100, unit.range * (1 + (has('ranged') ? .005 * l.astral : 0)))),
        speed: Math.min(100, boosted(unit.speed, has('mobile') ? .005 * l.insight : 0)),
    };
}

export const effectiveTowerUnit = (unit: EffectiveUnit, state: Kingdom) => applyTowerModifiers(unit, state.towers);
