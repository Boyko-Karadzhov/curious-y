import { LEGACY_UNITS, legacyUnitDefinition } from './legacyUnits.ts';
import { UNITS, initialUnitProgress, unitDefinition, type UnitId, type UnitProgress, type AbilityDefinition } from './units.ts';
import { resolveRosterCombat } from './unitCombat.ts';
import { FORGE, emptyForge, forgeLevel, rollEquipment, equipmentKey, equipmentSellGold, applyEquipment, validForge, type ForgeState, type EquipmentVisual } from './forge.ts';
export * from './forge.ts';
export * from './units.ts';
export * from './recruitment.ts';
import { RECRUITMENT, type UnitFamily, type Recruits, type RecruitingBuilding, isRecruitingBuilding, recruitmentLevel, rollRecruit, recruitLevel, trainingMultiplier, safeXP, innateXP } from './recruitment.ts';
import { applyTowerModifiers, emptyTowers, TOWER_RULE, type TowerProgress } from './towers.ts';
import { createLearningReward, KNOWLEDGE_RESOURCES, type LearningReward } from './resources.ts';

export const TOPICS = ['Physics', 'Mathematics & Logic', 'Chemistry', 'Life', 'Computer Science', 'Earth & Space', 'Mind & Behavior', 'Society & History'] as const;
export type TopicName = typeof TOPICS[number];

export const MAX_LEVEL = 5;
export const KEEP_DEFINITION = { id: 'castle', name: 'Keep', cap: MAX_LEVEL, baseHp: 240, hpPerLevel: 120,
  goldPerLevel: 40, resourcePerLevel: 10, topics: ['Mind & Behavior', 'Society & History'] as const };
export const stageLabel = (stage: number) => `${Math.floor((stage - 1) / 10) + 1}-${(stage - 1) % 10 + 1}`;
const difficulty = (stage: number) => 1 + (stage - 1) / 10;
export const battleGoldReward = (stage: number) => 60 + (stage - 1) * 10;
export const ARMY_LIMIT = 32;
export const ARMY_SLOTS = 5;
// Rules are immutable compatibility contracts. New tuning gets a new version.
export const BATTLE_RULES = {
  1: { maxSeconds: 120, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 },
  2: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  3: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  4: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  5: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  6: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  7: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  // Fivefold playback needs 450 simulation seconds for a 90-second wall timeout.
  8: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  10: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  9: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  11: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  12: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: 24, tempo: 1 / 3 },
  13: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: ARMY_LIMIT, tempo: 1 / 3 },
  14: { maxSeconds: 450, stepSeconds: 0.25, fieldLimit: ARMY_LIMIT, tempo: 1 / 3 },
} as const;
export type RulesVersion = keyof typeof BATTLE_RULES;
export const CURRENT_RULES: RulesVersion = 14;
const spawnTimeMultiplier = (version: RulesVersion, side: 'player' | 'enemy' = 'player') =>
  version >= 14 && side === 'player' ? 4 : version >= 11 ? 2 : 1;
// Advance the entire fixed-step simulation together: movement, attacks, healing,
// recruitment and status expiry. Old snapshots keep their original wall clock. Fivefold speed gives an exact
// 50ms wall step, so serialized millisecond timestamps never lose fractions.
export const battleSpeed = (version: RulesVersion) => version >= 6 ? 5 : 1;
export const battleSeconds = (battle: Battle, seconds: number) => Number((seconds / battleSpeed(battle.config.rulesVersion)).toFixed(2));
// Ability text is part of old snapshots; translate durations for display without
// mutating the saved definitions used by the compatibility validator.
export const unitAbilityDescription = (id: UnitId, version: RulesVersion = CURRENT_RULES) => (version >= 7 ? unitDefinition(id) : legacyUnitDefinition(id)).ability.description
  .replace(/\b(\d+(?:\.\d+)?)(s|\sseconds?)\b/g, (_, amount: string, suffix: string) => `${Number((Number(amount) / battleSpeed(version)).toFixed(2))}${suffix}`);
const CLASS_BUILDINGS = [
  { id: 'barracks', name: 'Recruitment Hall', unitId: 'militia', unit: 'All five unit classes', symbol: '⚔', unlock: 1, cost: 20 },
  { id: 'range', name: 'Archery Range', unitId: 'slinger', unit: 'Ranged units', symbol: '➶', unlock: 1, cost: 30 },
  { id: 'stable', name: 'Stable', unitId: 'hatchling', unit: 'Swarm creatures', symbol: '♞', unlock: 2, cost: 40 },
  { id: 'workshop', name: 'Siege Workshop', unitId: 'ballista', unit: 'Siege units', symbol: '◉', unlock: 3, cost: 60 },
  { id: 'academy', name: 'Academy', unitId: 'medic', unit: 'Healers', symbol: '✚', unlock: 2, cost: 40 },
] as const;
export const BUILDINGS = [CLASS_BUILDINGS[0]] as const;
export type BuildingId = typeof CLASS_BUILDINGS[number]['id'] | 'treasury' | 'library' | 'forge';
export interface BuildingEffects {
  armorPerLevel?: number; rangePerLevel?: number; speedPerLevel?: number;
  attackSeconds?: number; reloadPerLevel?: number; splashBase?: number; splashPerLevel?: number; splashFraction?: number;
  healBase?: number; healPerLevel?: number; healBudgetBase?: number; healBudgetPerLevel?: number;
  goldPercentPerLevel?: number; hpPercentPerLevel?: number;
}
export interface BuildingDefinition {
  id: BuildingId; name: string; unlock: number; cap: number; branch: string;
  mode: 'purchase' | 'knowledge' | 'future'; topics: readonly TopicName[]; cost: number;
  effect: 'armor' | 'reach' | 'mobility' | 'siege' | 'healing' | 'gold' | 'health' | 'equipment';
  effects: BuildingEffects;
}
// Stable construction IDs retain ownership; combat upgrades spend knowledge only.
const COMBAT_BUILDINGS: readonly BuildingDefinition[] = [
  { ...CLASS_BUILDINGS[0], cap: 100, branch: 'Military · Frontline', mode: 'purchase', topics: ['Physics'], effect: 'armor', effects: { armorPerLevel: 0.04 } },
  { ...CLASS_BUILDINGS[1], cap: 100, branch: 'Military · Ranged', mode: 'purchase', topics: ['Earth & Space', 'Mind & Behavior'], effect: 'reach', effects: { rangePerLevel: 2 } },
  { ...CLASS_BUILDINGS[2], cap: 100, branch: 'Military · Cavalry', mode: 'purchase', topics: ['Life', 'Chemistry'], effect: 'mobility', effects: { speedPerLevel: 0.1 } },
  { ...CLASS_BUILDINGS[3], cap: 100, branch: 'Military · Siege', mode: 'purchase', topics: ['Computer Science', 'Physics'], effect: 'siege', effects: { attackSeconds: 3, reloadPerLevel: 0.08, splashBase: 4, splashPerLevel: 1, splashFraction: 0.35 } },
  { ...CLASS_BUILDINGS[4], cap: 100, branch: 'Support', mode: 'purchase', topics: ['Life', 'Mind & Behavior'], effect: 'healing', effects: { healBase: 3, healPerLevel: 1, healBudgetBase: 24, healBudgetPerLevel: 6 } },
  { id: 'treasury', name: 'Treasury', unlock: 2, cap: 5, branch: 'Economy', mode: 'purchase', topics: ['Society & History', 'Mathematics & Logic'], cost: 40, effect: 'gold', effects: { goldPercentPerLevel: 2 } },
  { id: 'library', name: 'Library', unlock: 1, cap: 4, branch: 'Verified learning', mode: 'knowledge', topics: [], cost: 0, effect: 'health', effects: { hpPercentPerLevel: 1 } },
  { id: 'forge', name: 'Forge', unlock: FORGE.keepRequired, cap: FORGE.maxLevel, branch: 'Equipment', mode: 'purchase', topics: TOPICS, cost: FORGE.constructionPerResource * 2, effect: 'equipment', effects: {} },
];
export const BUILDING_DEFINITIONS: readonly BuildingDefinition[] = [
  { ...COMBAT_BUILDINGS[0], branch: 'Recruitment', topics: ['Life', 'Earth & Space'], cost: 10 },
  { ...COMBAT_BUILDINGS[4], name: 'War Academy', branch: 'Research', cap: 2, topics: ['Mathematics & Logic', 'Computer Science'], cost: 20 },
  { ...COMBAT_BUILDINGS[5], topics: [], cost: 0 },
  COMBAT_BUILDINGS[6],
  { ...COMBAT_BUILDINGS[7], topics: ['Physics', 'Chemistry'] },
];
export const FORGE_TOPICS: readonly TopicName[] = ['Physics', 'Chemistry'];
export type Doctrine = 'balanced' | 'shield-wall' | 'rapid-reserves';
export const DOCTRINES = [
  { id: 'balanced', name: 'Balanced', level: 0, description: 'Standard deployment and movement.' },
  { id: 'shield-wall', name: 'Shield wall', level: 1, description: '+10 percentage points of armor; 20% slower movement.' },
  { id: 'rapid-reserves', name: 'Rapid reserves', level: 2, description: '15% shorter deployment intervals; 10% less health.' },
] as const;
export function applyDoctrine(unit: EffectiveUnit, doctrine: Doctrine): EffectiveUnit {
  if (doctrine === 'shield-wall') return { ...unit, armor: Math.min(.5, (unit.armor ?? 0) + .1), speed: unit.speed * .8 };
  if (doctrine === 'rapid-reserves') return { ...unit, hp: Math.max(1, Math.round(unit.hp * .9)), spawnInterval: unit.spawnInterval * .85 };
  return unit;
}
export interface Tribute { day: string; territories: number; correct: boolean; claimed: boolean; paid: number }
export const utcDay = (now: string = new Date().toISOString()) => new Date(now).toISOString().slice(0, 10);
export const dailyTribute = (territories: number, treasury: number) => Math.floor(territories * 10 * (100 + treasuryPercent(treasury)) / 100);
export function refreshTribute(s: Kingdom, now: string) {
  const day = utcDay(now);
  if (s.tribute.day !== day) s.tribute = { day, territories: s.cleared, correct: false, claimed: false, paid: 0 };
}
export function creditGold(s: Kingdom, amount: number) {
  s.gold = safeXP(s.gold + amount); s.lifetimeGold = safeXP(s.lifetimeGold + amount);
}
export function claimTribute(s: Kingdom) {
  if (!s.tribute.correct || s.tribute.claimed || s.tribute.territories === 0) return;
  const amount = dailyTribute(s.tribute.territories, s.buildings.treasury);
  creditGold(s, amount); s.tribute.claimed = true; s.tribute.paid = amount;
}
function conquer(s: Kingdom, stage: number) {
  const first = s.cleared === 0;
  s.cleared = Math.max(s.cleared, stage);
  // The first territory starts income today. Further conquests join tomorrow.
  if (first) { s.tribute.territories = 1; claimTribute(s); }
}
export const LIBRARY_MILESTONES = [10, 30, 75, 150] as const;
export const libraryLevel = (count: number) => LIBRARY_MILESTONES.filter(n => count >= n).length;
export const treasuryPercent = (level: number) => Math.max(0, Math.min(5, level)) * BUILDING_DEFINITIONS.find(b => b.id === 'treasury')!.effects.goldPercentPerLevel!;
export const libraryModifiers = (s: Kingdom): PassiveBattleModifiers => ({ hpMultiplier: 1 + s.buildings.library * BUILDING_DEFINITIONS.find(b => b.id === 'library')!.effects.hpPercentPerLevel! / 100, damageMultiplier: 1 });
export const keepAppearance = (level: number) => ['Outpost', 'Fortified Keep', 'Citadel', 'Grand Citadel', 'Crown Keep'][level - 1];
// Unit identity and combat data are independent of construction identity.
export type ArmySlots = [string | null, string | null, string | null, string | null, string | null];
export interface PassiveBattleModifiers { hpMultiplier: number; damageMultiplier: number }
export const NO_BATTLE_MODIFIERS: PassiveBattleModifiers = { hpMultiplier: 1, damageMultiplier: 1 };
export interface UnitEffects {
  ability?: AbilityDefinition; damagePeriod?: number;
  armor?: number; attackInterval?: number; splashRadius?: number; splashFraction?: number;
  healPerSecond?: number; healBudget?: number;
}
export interface EffectiveUnit extends UnitEffects {
  equipment?: EquipmentVisual;
  id: UnitId; hp: number; damage: number; range: number; speed: number; spawnInterval: number; castleMultiplier: number;
}
export interface BattleConfiguration {
  towers?: TowerProgress;
  keepLevel?: number;
  reward?: { baseGold: number; treasuryPercent: number; bonusGold: number; totalGold: number };
  rulesVersion: RulesVersion; maxSeconds: number; stepSeconds: number; fieldLimit: number;
  slots: (EffectiveUnit | null)[]; modifiers: PassiveBattleModifiers;
  enemy: { units: EffectiveUnit[]; spawnInterval: number; firstSpawn: number };
}
export interface Fighter extends UnitEffects {
  equipment?: EquipmentVisual;
  cooldown?: number; healingLeft?: number;
  attackCount?: number; lastAttackAt?: number; lastTarget?: number; lastTargetX?: number; slowUntil?: number; rallyUntil?: number;
  groupId?: number; slotIndex?: number;
  id: number; kind: UnitId; side: 'player' | 'enemy'; x: number;
  hp: number; maxHp: number; damage: number; range: number; speed: number; castleMultiplier: number;
}
export interface Battle {
  // Present on battles resolved before playback. Identity distinguishes retries
  // of the same stage; seed and frozen config are the complete replay inputs.
  id?: string;
  seed?: number;
  paidGold?: number;
  rewardCollected: boolean;
  config: BattleConfiguration;
  stage: number; elapsed: number; nextSpawn: Partial<Record<string, number>>; nextEnemy: number; spawned: number; playerSpawned: number; nextId: number;
  playerHp: number; playerMaxHp: number; enemyHp: number; enemyMaxHp: number;
  fighters: Fighter[]; result: 'victory' | 'defeat' | 'draw' | null;
}

// Keep the original array order for ties, without allocating and sorting an
// opponents array for every fighter on every simulation step.
export function nearestOpponent(fighter: Fighter, fighters: readonly Fighter[]): Fighter | undefined {
  let target: Fighter | undefined;
  let distance = Infinity;
  for (const candidate of fighters) {
    if (candidate.side === fighter.side) continue;
    const next = Math.abs(candidate.x - fighter.x);
    if (next < distance) { target = candidate; distance = next; }
  }
  return target;
}
export interface RecruitmentResult { type: 'recruit'; requestId: string; building: RecruitingBuilding; previousLevel: number; level: number; recruits: { id: string; unitId: UnitId; discovered: boolean }[] }
export interface ActionEntropy { requestId: string; draws: number[]; now?: string; awardTribute?: boolean }
export const recruitmentCost = (_id: RecruitingBuilding): UpgradeCost => ({ gold: 0, resources: Object.fromEntries(RECRUITMENT.resources.map(t => [t, RECRUITMENT.cost])) });
export interface Kingdom {
  version: 11; lifetimeGold: number; tribute: Tribute; doctrine: Doctrine; forge: ForgeState; discovered: UnitId[]; units: Recruits; recruitCount: Record<RecruitingBuilding, number>; lastResult: RecruitmentResult | null; towers: TowerProgress; libraryConcepts: number; armySlots: ArmySlots; gold: number; tokens: Record<TopicName, number>; castle: number;
  buildings: Record<BuildingId, number>; rewarded: string[]; cleared: number; battle: Battle | null;
}
export type Action =
  // Only demo code may submit answer rewards; live rewards are a SQL transaction.
  | { type: 'answer'; id: string; topic: string; correct: boolean; reward?: LearningReward }
  | { type: 'recruit'; id: RecruitingBuilding }
  | { type: 'merge'; recipient: string; donors: string[] }
  | { type: 'lock'; id: string; locked: boolean }
  | { type: 'doctrine'; id: Doctrine }
  | { type: 'forge' }
  | { type: 'resolve-forge'; itemId: string; choice: 'equip' | 'sell' }
  | { type: 'castle' }
  | { type: 'building'; id: BuildingId }
  | { type: 'army'; slots: ArmySlots }
  | { type: 'start'; stage: number }
  | { type: 'collect-battle'; stage: number }
  | { type: 'tick' }
  | { type: 'retreat' };
export interface KingdomSnapshot { state: Kingdom; revision: number; generation: number; result?: RecruitmentResult | null }

export function newKingdom(): Kingdom {
  return { version: 11, lifetimeGold: 0, tribute: { day: '', territories: 0, correct: false, claimed: false, paid: 0 }, doctrine: 'balanced', forge: emptyForge(), discovered: [], units: {}, recruitCount: { barracks: 0 }, lastResult: null, towers: emptyTowers(), libraryConcepts: 0, armySlots: [null, null, null, null, null], gold: 0, tokens: Object.fromEntries(TOPICS.map(t => [t, 0])) as Record<TopicName, number>,
    castle: 1, buildings: { barracks: 0, range: 0, stable: 0, workshop: 0, academy: 0, treasury: 0, library: 0, forge: 0 }, rewarded: [], cleared: 0, battle: null };
}
export const castleHp = (level: number) => (KEEP_DEFINITION.baseHp + (level - 1) * KEEP_DEFINITION.hpPerLevel) * 3 ** (level - 1);
export interface UpgradeCost { gold: number; resources: Partial<Record<TopicName, number>> }
export const forgeCost = (): UpgradeCost => ({ gold: 0, resources: Object.fromEntries(FORGE_TOPICS.map(t => [t, FORGE.resourceCost])) });
export const castleCost = (level: number): UpgradeCost => ({
  gold: level * KEEP_DEFINITION.goldPerLevel, resources: Object.fromEntries(KEEP_DEFINITION.topics.map(t => [t, level * KEEP_DEFINITION.resourcePerLevel])),
});
export const buildingCost = (id: BuildingId, level: number): UpgradeCost => {
  const spec = BUILDING_DEFINITIONS.find(b => b.id === id)!;
  const amount = spec.cost / 2 * (level + 1);
  return { gold: id === 'treasury' ? (level + 1) * 40 : id === 'academy' ? (level + 1) * 30 : 0, resources: Object.fromEntries(spec.topics.map(topic => [topic, amount])) };
};
export const canAfford = (state: Kingdom, cost: UpgradeCost) => state.gold >= cost.gold
  && TOPICS.every(topic => state.tokens[topic] >= (cost.resources[topic] ?? 0));
export const formatCost = (cost: UpgradeCost) => [
  ...(cost.gold ? [`${cost.gold} Gold`] : []),
  ...KNOWLEDGE_RESOURCES.filter(r => cost.resources[r.topic]).map(r => `${cost.resources[r.topic]} ${r.name}`),
].join(' · ');
export const missingCost = (state: Kingdom, cost: UpgradeCost): UpgradeCost => ({
  gold: Math.max(0, cost.gold - state.gold),
  resources: Object.fromEntries(TOPICS.map(topic => [topic, Math.max(0, (cost.resources[topic] ?? 0) - state.tokens[topic])])),
});
export type UpgradeAction = Extract<Action, { type: 'castle' | 'building' }>;
// Used by both purchase commands and progression UI. Affordability alone is not eligibility.
export function upgradeStatus(state: Kingdom, action: UpgradeAction) {
  const spec = action.type === 'building' ? BUILDING_DEFINITIONS.find(b => b.id === action.id) : undefined;
  const level = action.type === 'castle' ? state.castle : spec ? state.buildings[spec.id] : 0;
  const cost = action.type === 'castle' ? castleCost(level) : spec ? buildingCost(spec.id, level) : { gold: 0, resources: {} };
  const requiredCastle = spec ? isRecruitingBuilding(spec.id) || spec.id === 'forge' ? spec.unlock : Math.max(spec.unlock, level + 1) : 0;
  const blocker = action.type === 'building' && !spec ? 'Unknown building.'
    : spec && isRecruitingBuilding(spec.id) && level > 0 ? 'Building levels are earned every ten recruitments.'
    : spec?.id === 'forge' && level > 0 ? 'Forge levels are earned every ten forges.'
    : spec?.mode === 'knowledge' ? 'Library progress is earned through verified learning, never purchased.'
    : spec?.mode === 'future' ? 'Forge equipment is a future system.'
    : level >= (spec?.cap ?? MAX_LEVEL) ? 'Already at maximum level.'
    : state.battle && !state.battle.result ? 'Finish or retreat from the battle before upgrading.'
    : spec && state.castle < requiredCastle ? `Requires Keep (Castle) level ${requiredCastle}.` : null;
  const affordable = canAfford(state, cost);
  return { cost, missing: missingCost(state, cost), requiredCastle, blocker, affordable, ready: !blocker && affordable };
}
function spend(state: Kingdom, cost: UpgradeCost) {
  requireRule(canAfford(state, cost), `You need ${formatCost(missingCost(state, cost))} more.`);
  state.gold -= cost.gold;
  for (const topic of TOPICS) state.tokens[topic] -= cost.resources[topic] ?? 0;
}
export const unitStats = (id: UnitId, level: number, rulesVersion: RulesVersion = CURRENT_RULES,
  modifiers: PassiveBattleModifiers = NO_BATTLE_MODIFIERS, progress: UnitProgress = initialUnitProgress(), side: 'player' | 'enemy' = 'player'): EffectiveUnit => {
  const spec = rulesVersion >= 7 ? unitDefinition(id) : legacyUnitDefinition(id);
  const multiplier = rulesVersion >= 10 ? trainingMultiplier(progress.level) : (1 + (level - 1) * 0.3) * (rulesVersion >= 5 ? 1 + .08 * (progress.level - 1) + .06 * (progress.stars - 1) : 1);
  const tempo = BATTLE_RULES[rulesVersion].tempo;
  const tier = rulesVersion >= 10 ? 0 : Math.max(0, Math.min(4, level - 1));
  const tuning = rulesVersion >= 3 ? COMBAT_BUILDINGS.find(b => b.id === spec.building)!.effects : {};
  const effects: UnitEffects = rulesVersion < 3 ? {} : {
    armor: tier * (tuning.armorPerLevel ?? 0),
    attackInterval: tuning.attackSeconds ? Math.round(tuning.attackSeconds * 4 / (1 + tier * tuning.reloadPerLevel!)) / 4 : 0,
    splashRadius: (tuning.splashBase ?? 0) + tier * (tuning.splashPerLevel ?? 0),
    splashFraction: tuning.splashFraction ?? 0,
    healPerSecond: (tuning.healBase ?? 0) + tier * (tuning.healPerLevel ?? 0),
    healBudget: (tuning.healBudgetBase ?? 0) + tier * (tuning.healBudgetPerLevel ?? 0),
  };
  if (rulesVersion >= 5) {
    effects.ability = structuredClone(spec.ability);
    effects.armor = Math.min(.5, (effects.armor ?? 0) + (spec.ability.armor ?? 0));
    // Workshop retains its legacy three-second damage packet and reload bonus.
    effects.attackInterval = (rulesVersion >= 7 ? spec.building === 'workshop' : spec.id === 'catapult') ? effects.attackInterval : spec.ability.interval;
    effects.damagePeriod = (rulesVersion >= 7 ? spec.building === 'workshop' : spec.id === 'catapult') ? 3 : spec.ability.interval;
    effects.splashRadius = spec.ability.family === 'splash' ? (rulesVersion >= 7 ? spec.building === 'workshop' : spec.id === 'catapult') ? effects.splashRadius : spec.ability.radius : 0;
    effects.splashFraction = spec.ability.family === 'splash' ? spec.ability.fraction : 0;
    if (rulesVersion >= 7 && spec.ability.family === 'heal') {
      const power = 3 ** (unitDefinition(id).tier - 1) * multiplier;
      effects.healPerSecond! *= power; effects.healBudget! *= power;
    }
    if (spec.ability.family !== 'heal') { effects.healPerSecond = 0; effects.healBudget = 0; }
  }
  return { id, hp: Math.round(spec.hp * multiplier * modifiers.hpMultiplier),
    damage: Number((Math.round(spec.damage * multiplier) * modifiers.damageMultiplier * tempo).toFixed(6)),
    range: spec.range + tier * (tuning.rangePerLevel ?? 0),
    speed: spec.speed * tempo * (1 + tier * (tuning.speedPerLevel ?? 0)),
    spawnInterval: spec.spawnInterval / tempo * spawnTimeMultiplier(rulesVersion, side), castleMultiplier: spec.castleMultiplier, ...effects };
};
export function effectDescription(id: BuildingId, level: number): string {
  if (!level) return 'Not built';
  if (id === 'academy') return `Unlocks ${level === 1 ? 'Shield wall' : 'Shield wall and Rapid reserves'} battle doctrines.`;
  if (isRecruitingBuilding(id)) return 'Recruit three independent copies from all five classes. Every ten recruitments improves tier odds.';
  if (id === 'treasury') return `+${treasuryPercent(level)}% daily tribute (rounded down)`;
  if (id === 'library') return `+${level}% army health in new battles`;
  return level ? 'Forge weapons, armor and artifacts. Level up every 10 forges for better tier odds.' : 'Turn learning resources into equipment or Gold.';
}

const active = (s: Kingdom) => s.battle !== null && s.battle.result === null;
const requireRule = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
export const eligibleUnit = (s: Kingdom, id: string) => {
  const owned = s.units[id];
  return !!owned && s.buildings.barracks > 0;
};
export const hasBattleReward = (s: Kingdom) => s.battle?.result === 'victory' && s.battle.rewardCollected === false;
export const defaultArmy = (): ArmySlots => [null,null,null,null,null];
export function validateArmy(s: Kingdom, slots: unknown): asserts slots is ArmySlots {
  requireRule(Array.isArray(slots) && slots.length === ARMY_SLOTS
    && slots.every(id => id === null || typeof id === 'string' && eligibleUnit(s,id))
    && new Set(slots.filter(id => id !== null)).size === slots.filter(id => id !== null).length,
    'Choose five slots using a separate owned copy in each slot.');
}
export const capacityUsed = (b: Battle, side: Fighter['side']) => new Set(b.fighters.filter(f => f.side === side).map(f => f.groupId ?? f.id)).size;
export const spawnKey = (b: Battle, index: number, id: UnitId) => b.config.rulesVersion >= 13 ? String(index) : id;
function spawn(battle: Battle, spec: EffectiveUnit, side: Fighter['side'], slotIndex?: number) {
  const groupId = battle.nextId;
  const size = battle.config.rulesVersion >= 13 && unitDefinition(spec.id).unitClass === 'swarm' ? 5 : 1;
  for (let member = 0; member < size; member++) {
  const { armor, attackInterval, splashRadius, splashFraction, healPerSecond, healBudget } = spec;
  battle.fighters.push({ ...(battle.config.rulesVersion >= 13 ? { groupId, ...(slotIndex !== undefined ? { slotIndex } : {}) } : {}), id: battle.nextId++, kind: spec.id, side, x: side === 'player' ? 5 : 95,
    ...(spec.equipment ? { equipment: { ...spec.equipment } } : {}),
    ...(battle.config.rulesVersion >= 3 ? { armor, attackInterval, splashRadius, splashFraction, healPerSecond, healBudget, cooldown: 0, healingLeft: healBudget ?? 0 } : {}),
    ...(battle.config.rulesVersion >= 5 ? { ability: structuredClone(spec.ability), damagePeriod: spec.damagePeriod, attackCount: 0, lastAttackAt: 0, lastTarget: 0, lastTargetX: side === 'player' ? 100 : 0, slowUntil: 0, rallyUntil: 0 } : {}),
    hp: spec.hp, maxHp: spec.hp, damage: spec.damage, range: spec.range, speed: spec.speed, castleMultiplier: spec.castleMultiplier });
  }
}
function battleConfiguration(s: Kingdom, stage: number, rulesVersion: RulesVersion): BattleConfiguration {
  const rules = BATTLE_RULES[rulesVersion];
  const strength = difficulty(stage);
  const modifiers = rulesVersion >= 3 ? libraryModifiers(s) : { ...NO_BATTLE_MODIFIERS };
  const baseGold = battleGoldReward(stage);
  const percent = rulesVersion >= 13 ? 0 : rulesVersion >= 3 ? treasuryPercent(s.buildings.treasury) : 0;
  const bonusGold = Math.floor(baseGold * percent / 100);
  return { rulesVersion, maxSeconds: rules.maxSeconds, stepSeconds: rules.stepSeconds, fieldLimit: rules.fieldLimit,
    ...(rulesVersion >= 3 ? { keepLevel: s.castle, reward: { baseGold, treasuryPercent: percent, bonusGold, totalGold: baseGold + bonusGold } } : {}),
    ...(rulesVersion >= 4 ? { towers: structuredClone(s.towers) } : {}),
    slots: (rulesVersion >= 9 ? s.armySlots : s.armySlots.slice(0, 4)).map(id => {
      if (!id) return null;
      const owned = s.units[id];
      const unit = unitStats(owned.unitId, 1, rulesVersion, modifiers, { ...initialUnitProgress(), level: recruitLevel(owned) });
      const boosted = rulesVersion >= 4 ? applyTowerModifiers(unit, s.towers) : unit;
      const equipped = rulesVersion >= 12 ? applyEquipment(boosted, s.forge.equipped) : boosted;
      return rulesVersion >= 13 ? applyDoctrine(equipped, s.doctrine) : equipped;
    }),
    modifiers,
    enemy: rulesVersion >= 6 ? campaignEnemy(stage, rulesVersion) : {
      units: (rulesVersion >= 5 ? legacyEnemyComposition(stage).map(legacyUnitDefinition) : LEGACY_UNITS.slice(0, Math.min(4, Math.floor(strength)))).map(u => unitStats(u.id, Math.max(1, strength - 1), rulesVersion)),
      spawnInterval: Math.max(2.75, 6 - strength * 0.5) / rules.tempo, firstSpawn: 3 / rules.tempo } };
}
// Preview uses exactly the same configuration as Start, including the opponent.
export function createBattle(s: Kingdom, stage = s.cleared + 1): Battle {
  s = reconcileUnits(s);
  validateArmy(s, s.armySlots);
  const config = battleConfiguration(s, stage, CURRENT_RULES);
  const enemyHp = campaignCastleHp(stage);
  return { seed: 0, config, stage, rewardCollected: false, paidGold: 0, elapsed: 0, nextSpawn: Object.fromEntries(config.slots.flatMap((u, i) => u ? [[config.rulesVersion >= 13 ? String(i) : u.id, u.spawnInterval]] : [])),
    nextEnemy: config.enemy.firstSpawn, spawned: 0, playerSpawned: 0, nextId: 1,
    playerHp: castleHp(s.castle), playerMaxHp: castleHp(s.castle), enemyHp, enemyMaxHp: enemyHp, fighters: [], result: null };
}
function recruit(b: Battle) {
  let count = capacityUsed(b, 'player');
  const due = b.config.slots.flatMap((spec, index) => spec ? [{ spec, index, key: spawnKey(b, index, spec.id) }] : [])
    .filter(({ key }) => b.nextSpawn[key]! <= b.elapsed).sort((a, c) => b.nextSpawn[a.key]! - b.nextSpawn[c.key]! || a.index - c.index);
  for (const { spec, index, key } of due) {
    if (count >= b.config.fieldLimit) break;
    spawn(b, spec, 'player', index);
    const dueAt = b.nextSpawn[key]!;
    b.nextSpawn[key] = (b.config.rulesVersion >= 4 && b.elapsed - dueAt < b.config.stepSeconds ? dueAt : b.elapsed) + spec.spawnInterval;
    b.playerSpawned++; count++;
  }
}

// Fixed simulation step: deterministic, simultaneous damage, bounded duration and unit count.
function tickBattle(b: Battle) {
  const dt = b.config.stepSeconds;
  b.elapsed += dt;
  recruit(b);
  if (b.elapsed >= b.nextEnemy) {
    const enemy = b.config.enemy;
    if (b.config.rulesVersion < 5 || capacityUsed(b, 'enemy') < b.config.fieldLimit) spawn(b, enemy.units[b.spawned % enemy.units.length], 'enemy');
    b.spawned++;
    b.nextEnemy += enemy.spawnInterval;
  }
  if (b.config.rulesVersion >= 5) resolveRosterCombat(b, dt);
  else {
    const damage = new Map<number, number>();
    const healing = new Map<number, number>();
    const positions = new Map<number, number>();
    for (const fighter of b.fighters) {
      const direction = fighter.side === 'player' ? 1 : -1;
      const target = nearestOpponent(fighter, b.fighters);
      const distance = target ? Math.abs(target.x - fighter.x) : Infinity;
      if (b.config.rulesVersion >= 3 && fighter.kind === 'medic') {
        const ally = healingTarget(fighter, b.fighters);
        if (ally && (fighter.healingLeft ?? 0) > 0) {
          const amount = Math.max(0, Math.min((fighter.healPerSecond ?? 0) * dt, fighter.healingLeft!, ally.maxHp - ally.hp - (healing.get(ally.id) ?? 0)));
          healing.set(ally.id, (healing.get(ally.id) ?? 0) + amount);
          fighter.healingLeft! -= amount;
        } else if (distance > fighter.range) {
          positions.set(fighter.id, Math.max(0, Math.min(100, fighter.x + direction * Math.min(fighter.speed * dt, distance - fighter.range))));
        }
        continue;
      }
      const interval = b.config.rulesVersion >= 3 ? fighter.attackInterval ?? 0 : 0;
      if (interval) fighter.cooldown = Math.max(0, (fighter.cooldown ?? 0) - dt);
      const canHit = !interval || fighter.cooldown === 0;
      const hitDamage = fighter.damage * (interval ? 3 : dt);
      if (target && distance <= fighter.range) {
        if (canHit) {
          damage.set(target.id, (damage.get(target.id) || 0) + hitDamage);
          if (interval) {
            fighter.cooldown = interval;
            for (const other of b.fighters.filter(f => f.side !== fighter.side && f.id !== target.id && Math.abs(f.x - target.x) <= (fighter.splashRadius ?? 0)).slice(0, 2)) {
              damage.set(other.id, (damage.get(other.id) ?? 0) + hitDamage * (fighter.splashFraction ?? 0));
            }
          }
        }
      } else if (Math.abs((fighter.side === 'player' ? 100 : 0) - fighter.x) <= fighter.range) {
        const hit = canHit ? hitDamage * fighter.castleMultiplier : 0;
        if (canHit && interval) fighter.cooldown = interval;
        if (fighter.side === 'player') b.enemyHp -= hit;
        else b.playerHp -= hit;
      } else {
        // Stop at the enemy's frontline; fast units cannot pass through defenders.
        const travel = Math.min(fighter.speed * dt, Math.max(0, distance - 2));
        positions.set(fighter.id, Math.max(0, Math.min(100, fighter.x + direction * travel)));
      }
    }
    b.fighters = b.fighters.map(f => {
      const hp = f.hp - (damage.get(f.id) || 0) * (1 - (b.config.rulesVersion >= 3 ? f.armor ?? 0 : 0));
      // Lethal damage wins: no resurrection and no healing past maximum health.
      return { ...f, hp: hp <= 0 ? hp : Math.min(f.maxHp, hp + (healing.get(f.id) ?? 0)), x: positions.get(f.id) ?? f.x };
    }).filter(f => f.hp > 0);
  }
  b.playerHp = Math.max(0, b.playerHp);
  b.enemyHp = Math.max(0, b.enemyHp);
  if (b.playerHp === 0 && b.enemyHp === 0) b.result = 'draw';
  else if (b.enemyHp === 0) b.result = 'victory';
  else if (b.playerHp === 0) b.result = 'defeat';
  else if (b.elapsed >= b.config.maxSeconds) b.result = 'draw';
}

/** Reconstruct time zero from persisted inputs, never today's army or tuning. */
export function replayBattle(battle: Battle): Battle {
  const b = structuredClone(battle);
  return { ...b, elapsed: 0, rewardCollected: false, paidGold: 0,
    nextSpawn: Object.fromEntries(b.config.slots.flatMap((u, i) => u ? [[b.config.rulesVersion >= 13 ? String(i) : u.id, u.spawnInterval]] : [])),
    nextEnemy: b.config.enemy.firstSpawn, spawned: 0, playerSpawned: 0, nextId: 1,
    playerHp: b.playerMaxHp, enemyHp: b.enemyMaxHp, fighters: [], result: null };
}

/** Shared by server settlement and client playback; no wall clock or I/O.
 * Combat currently makes no random choices. Any future randomness must use the
 * persisted seed and a deterministic draw order, never Math.random(). */
export function advanceBattle(battle: Battle, steps = 1): Battle {
  requireRule(Number.isSafeInteger(steps) && steps >= 0, 'Invalid simulation steps.');
  if (battle.result || !steps) return battle;
  const next = structuredClone(battle);
  const limit = Math.ceil((next.config.maxSeconds - next.elapsed) / next.config.stepSeconds);
  for (let i = 0; i < Math.min(steps, limit) && !next.result; i++) tickBattle(next);
  return next;
}

/** Resolve and persist once. Playback is never allowed to award campaign wins. */
export function settleBattle(state: Kingdom): Kingdom {
  if (!state.battle || state.battle.result) return state;
  const battle = advanceBattle(state.battle, Math.ceil(state.battle.config.maxSeconds / state.battle.config.stepSeconds));
  const next = { ...state, tribute: { ...state.tribute }, battle };
  if (battle.result === 'victory') conquer(next, battle.stage);
  return next;
}

export function applyAction(state: Kingdom, action: Action, entropy?: ActionEntropy): Kingdom {
  const s = reconcileUnits(structuredClone(state));
  if (action.type !== 'tick') refreshTribute(s, entropy?.now ?? new Date().toISOString());
  switch (action.type) {
    case 'answer': {
      requireRule(!!action.id && TOPICS.includes(action.topic as TopicName), 'This question needs a supported topic before it can earn resources.');
      if (s.rewarded.includes(action.id)) return state;
      // The optional fallback supports old Demo commands only. Live commands reject answer.
      const reward = action.reward ?? createLearningReward(action.id, action.correct, null, action.topic);
      requireRule(reward.id === action.id && Number.isSafeInteger(reward.totalKnowledge) && reward.totalKnowledge >= 0
        && reward.lines.every(line => KNOWLEDGE_RESOURCES.some(r => r.key === line.key)
          && Number.isSafeInteger(line.amount) && line.amount > 0)
        && new Set(reward.lines.map(line => line.key)).size === reward.lines.length
        && reward.lines.reduce((sum, line) => sum + line.amount, 0) === reward.totalKnowledge,
      'Invalid reward breakdown.');
      for (const line of reward.lines) s.tokens[KNOWLEDGE_RESOURCES.find(r => r.key === line.key)!.topic] += line.amount;
      s.rewarded.push(action.id);
      if (action.correct && entropy?.awardTribute !== false) { s.tribute.correct = true; claimTribute(s); }
      break;
    }
    case 'recruit': {
      requireRule(isRecruitingBuilding(action.id) && s.buildings[action.id] > 0, 'Construct this building first.');
      requireRule(!!entropy && entropy.draws.length === RECRUITMENT.packSize * 2 && /^[a-zA-Z0-9-]{1,100}$/.test(entropy.requestId), 'Recruitment requires server-owned random draws.');
      const previousLevel = s.buildings[action.id];
      spend(s, recruitmentCost(action.id));
      const known = new Set(s.discovered);
      const recruits = entropy!.draws.slice(0, RECRUITMENT.packSize).map((draw, index) => {
        const classDraw = entropy!.draws[index + RECRUITMENT.packSize];
        requireRule(Number.isFinite(classDraw) && classDraw >= 0 && classDraw < 1, 'Invalid class draw.');
        const families: UnitFamily[] = ['barracks','range','stable','academy','workshop'];
        const family = s.recruitCount.barracks === 0 ? families[index] : families[Math.floor(classDraw * families.length)];
        const unitId = rollRecruit(family, previousLevel, draw), id = `${entropy!.requestId}-${index}`;
        requireRule(!s.units[id], 'Recruitment identity already exists.');
        s.units[id] = { unitId, investedXP: 0, locked: false };
        const discovered = !known.has(unitId); known.add(unitId);
        return { id, unitId, discovered };
      });
      s.discovered = [...known];
      s.recruitCount[action.id] = safeXP(s.recruitCount[action.id] + 1);
      s.buildings[action.id] = recruitmentLevel(s.recruitCount[action.id]);
      s.lastResult = { type: 'recruit', requestId: entropy!.requestId, building: action.id, previousLevel, level: s.buildings[action.id], recruits };
      break;
    }
    case 'merge': {
      requireRule(Array.isArray(action.donors) && action.donors.length > 0 && new Set(action.donors).size === action.donors.length, 'Choose distinct donors.');
      const recipient = s.units[action.recipient];
      requireRule(!!recipient, 'Choose an owned recipient.');
      let xp = recipient.investedXP;
      for (const id of action.donors) {
        const donor = s.units[id];
        requireRule(id !== action.recipient && !!donor && !donor.locked && !s.armySlots.includes(id), 'Equipped or locked copies cannot be consumed.');
        requireRule(unitDefinition(donor.unitId).unitClass === unitDefinition(recipient.unitId).unitClass, 'Merge copies of the same class.');
        xp = safeXP(xp + innateXP(donor.unitId) + donor.investedXP);
      }
      safeXP(xp + innateXP(recipient.unitId));
      recipient.investedXP = xp;
      for (const id of action.donors) delete s.units[id];
      break;
    }
    case 'lock':
      requireRule(!!s.units[action.id] && typeof action.locked === 'boolean', 'Choose an owned copy.');
      s.units[action.id].locked = action.locked; break;
    case 'doctrine':
      requireRule(!active(s) && DOCTRINES.some(d => d.id === action.id && s.buildings.academy >= d.level), 'Research this doctrine at the War Academy first.');
      s.doctrine = action.id; break;
    case 'forge': {
      requireRule(s.buildings.forge > 0, 'Construct the Forge first.');
      requireRule(!s.forge.pending, 'Equip or sell your forged item first.');
      requireRule(!!entropy, 'Forging requires server-owned random draws.');
      const item = rollEquipment(s.buildings.forge, entropy!.requestId, entropy!.draws);
      requireRule(!Object.values(s.forge.equipped).some(i => i?.id === item.id), 'Equipment identity already exists.');
      spend(s, forgeCost());
      s.forge.count = safeXP(s.forge.count + 1);
      s.buildings.forge = forgeLevel(s.forge.count);
      s.forge.pending = item;
      break;
    }
    case 'resolve-forge': {
      const item = s.forge.pending;
      requireRule(!!item && item.id === action.itemId && ['equip','sell'].includes(action.choice), 'This item is no longer awaiting a decision.');
      const key = equipmentKey(item!);
      const sold = action.choice === 'sell' ? item : s.forge.equipped[key];
      if (sold) creditGold(s, equipmentSellGold(sold));
      if (action.choice === 'equip') s.forge.equipped[key] = item!;
      s.forge.pending = null;
      break;
    }
    case 'castle': {
      const { cost, blocker } = upgradeStatus(s, action);
      requireRule(!blocker, blocker ?? '');
      spend(s, cost); s.castle++;
      break;
    }
    case 'building': {
      const { cost, blocker } = upgradeStatus(s, action);
      requireRule(!blocker, blocker ?? '');
      spend(s, cost); s.buildings[action.id]++;
      break;
    }
    case 'army': {
      requireRule(!active(s), 'Finish or retreat from the battle before changing your army.');
      validateArmy(s, action.slots);
      s.armySlots = [...action.slots];
      break;
    }
    case 'start': {
      requireRule(!active(s), 'A battle is already in progress.');
      requireRule(!hasBattleReward(s), 'Collect your battle Gold before starting another battle.');
      validateArmy(s, s.armySlots);
      requireRule(s.armySlots.some(id => id !== null), 'Equip at least one eligible unit. Build a military building, Recruit, then equip your first unit.');
      requireRule(Number.isSafeInteger(action.stage) && action.stage === s.cleared + 1, 'Fight the next unbeaten battle. Win the previous battle before advancing.');
      s.battle = createBattle(s, action.stage);
      break;
    }
    case 'collect-battle': {
      requireRule(s.battle?.result === 'victory' && s.battle.stage === action.stage, 'There is no reward for this battle.');
      if (s.battle!.rewardCollected) return state;
      s.battle!.paidGold = battleReward(s.battle!).totalGold;
      creditGold(s, s.battle!.paidGold!);
      s.battle!.rewardCollected = true;
      break;
    }
    case 'tick':
      if (!active(s)) return state;
      tickBattle(s.battle!);
      if (s.battle!.result === 'victory') conquer(s, s.battle!.stage);
      break;
    case 'retreat':
      requireRule(active(s), 'There is no active battle.');
      s.battle!.result = 'defeat';
      break;
    default: throw new Error('Unsupported Castle command.');
  }
  return reconcileUnits(s);
}

// Conversion only recognizes the old schema; damaged modern snapshots never
// silently fall back to defaults. Callers write only after a successful command.
export function parseKingdom(raw: string): Kingdom {
  const unreadable = 'Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.';
  let s: Kingdom;
  try { s = JSON.parse(raw); } catch { throw new Error(unreadable); }
  const integer = (n: number, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
  const finite = (n: number, min: number, max = Number.MAX_VALUE) => Number.isFinite(n) && n >= min && n <= max;
  requireRule(!!s && typeof s === 'object', unreadable);
  const version = (s as {version:number}).version;
  // Development reset: retain learning evidence and wallets, reset the game systems.
  if (Number.isInteger(version) && version >= 1 && version < 11) {
    s = { ...newKingdom(), tokens: s.tokens, gold: s.gold, lifetimeGold: s.gold,
      towers: s.towers ?? emptyTowers(), libraryConcepts: s.libraryConcepts ?? 0,
      buildings: { ...newKingdom().buildings, library: libraryLevel(s.libraryConcepts ?? 0) } };
  }
  const validTowers = (t: TowerProgress | undefined) => !!t && t.rule === TOWER_RULE && !!t.points
    && Object.keys(t.points).length === KNOWLEDGE_RESOURCES.length && KNOWLEDGE_RESOURCES.every(r => integer(t.points[r.key], 0));
  requireRule(s.version === 11 && Array.isArray(s.discovered) && new Set(s.discovered).size === s.discovered.length && s.discovered.every(id => UNITS.some(u => u.id === id)) && validTowers(s.towers) && integer(s.gold, 0) && integer(s.castle, 1, MAX_LEVEL)
    && integer(s.cleared,0,Number.MAX_SAFE_INTEGER-1) && !!s.tokens && TOPICS.every(t => integer(s.tokens[t],0))
    && integer(s.libraryConcepts,0) && !!s.buildings && !!s.recruitCount
    && BUILDING_DEFINITIONS.every(b => integer(s.buildings[b.id],0,isRecruitingBuilding(b.id) ? RECRUITMENT.buildingCap : b.cap)
      && (s.buildings[b.id] === 0 || s.castle >= b.unlock)
      && (!isRecruitingBuilding(b.id) || integer(s.recruitCount[b.id],0) && (s.buildings[b.id] === 0 ? s.recruitCount[b.id] === 0 : s.buildings[b.id] === recruitmentLevel(s.recruitCount[b.id]))))
    && s.buildings.library === libraryLevel(s.libraryConcepts)
    && validForge(s.forge, s.buildings.forge)
    && Array.isArray(s.rewarded) && s.rewarded.every(id => typeof id === 'string'), unreadable);
  requireRule(!!s.units && typeof s.units === 'object' && !Array.isArray(s.units)
    && Object.entries(s.units).every(([id,r]) => /^[a-zA-Z0-9-]{1,110}$/.test(id) && !!r
      && Object.keys(r).sort().join(',') === 'investedXP,locked,unitId'
      && UNITS.some(u => u.id === r.unitId) && integer(r.investedXP,0,Number.MAX_SAFE_INTEGER-innateXP(r.unitId))
      && typeof r.locked === 'boolean' && s.buildings.barracks > 0), unreadable);
  requireRule(integer(s.lifetimeGold, s.gold) && !!s.tribute && (s.tribute.day === '' || /^\d{4}-\d{2}-\d{2}$/.test(s.tribute.day))
    && integer(s.tribute.territories, 0, s.cleared) && typeof s.tribute.correct === 'boolean' && typeof s.tribute.claimed === 'boolean'
    && integer(s.tribute.paid, 0) && (!s.tribute.claimed || s.tribute.correct && s.tribute.territories > 0)
    && DOCTRINES.some(d => d.id === s.doctrine && s.buildings.academy >= d.level), unreadable);
  if (s.lastResult !== null) {
    const r=s.lastResult;
    requireRule(!!r && typeof r.requestId === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(r.requestId)
      && (r.type === 'recruit' ? isRecruitingBuilding(r.building) && integer(r.previousLevel,1,RECRUITMENT.buildingCap)
        && integer(r.level,r.previousLevel,Math.min(RECRUITMENT.buildingCap,r.previousLevel+1))
        && Array.isArray(r.recruits) && r.recruits.length === RECRUITMENT.packSize
        && new Set(r.recruits.map(u=>u.id)).size === RECRUITMENT.packSize
        && r.recruits.every(u=>typeof u.id==='string' && UNITS.some(spec=>spec.id===u.unitId) && typeof u.discovered==='boolean')

      : false), unreadable);
  }
  validateArmy(s,s.armySlots);
  if (s.battle !== null) {
    const b = s.battle;
    const error = 'Battle save could not be read. Your stored data has been preserved.';
    requireRule(!!b && integer(b.stage, 1) && Array.isArray(b.fighters), error);
    // Victories saved before explicit collection already credited their Gold.
    if (b.rewardCollected === undefined) b.rewardCollected = b.result === 'victory';
    requireRule(typeof b.rewardCollected === 'boolean' && (!b.rewardCollected || b.result === 'victory'), error);
    const c = b.config;
    if (c?.rulesVersion < 3 && b.paidGold === undefined) b.paidGold = b.rewardCollected ? battleGoldReward(b.stage) : 0;
    const rules = c && BATTLE_RULES[c.rulesVersion];
    const definitions = c?.rulesVersion >= 7 ? UNITS : LEGACY_UNITS;
    const definition = (id: UnitId) => c?.rulesVersion >= 7 ? unitDefinition(id) : legacyUnitDefinition(id);
    // jsonb reorders object keys: compare the schema/value set, never JSON text.
    const validAbility = (u: UnitEffects, id: UnitId) => !!u.ability && Object.keys(u.ability).length === Object.keys(definition(id).ability).length
      && Object.entries(definition(id).ability).every(([key, value]) => u.ability![key as keyof AbilityDefinition] === value)
      && finite(u.damagePeriod!, .25, 3);
    const validEffects = (u: UnitEffects) => finite(u.armor!, 0, c.rulesVersion >= 4 ? .5 : .16) && finite(u.attackInterval!, 0, 3)
      && finite(u.splashRadius!, 0, 8) && finite(u.splashFraction!, 0, c.rulesVersion >= 4 ? .5 : .35)
      && finite(u.healPerSecond!, 0, c.rulesVersion >= 10 ? Number.MAX_SAFE_INTEGER : c.rulesVersion >= 7 ? 2000 : c.rulesVersion >= 4 ? 7.14 : 7) && finite(u.healBudget!, 0, c.rulesVersion >= 10 ? Number.MAX_SAFE_INTEGER : c.rulesVersion >= 7 ? 13000 : c.rulesVersion >= 4 ? 48.96 : 48);
    const validEquipment = (u: {equipment?: EquipmentVisual}) => u.equipment === undefined || !!u.equipment && Object.keys(u.equipment).sort().join(',') === 'armor,weapon' && integer(u.equipment.weapon,0,5) && integer(u.equipment.armor,0,5);
    const validUnit = (u: EffectiveUnit) => !!u && definitions.some(spec => spec.id === u.id)
      && finite(u.hp, 1) && finite(u.damage, definition(u.id).ability.family === 'heal' ? 0 : 0.01) && finite(u.range, 1, 100) && finite(u.speed, 0.01, 100)
      && validEquipment(u) && finite(u.spawnInterval, 0.25, c.rulesVersion >= 14 ? 60 : 30) && finite(u.castleMultiplier, 1, 100)
      && (c.rulesVersion < 3 ? u.id !== 'medic' : validEffects(u)) && (c.rulesVersion < 5 ? definition(u.id).starter : validAbility(u, u.id));
    requireRule(!!rules && (b.id === undefined || typeof b.id === 'string' && b.id.length > 0 && b.id.length <= 128)
      && (c.rulesVersion < 5 || integer(b.seed!, 0, 4294967295)) && (c.rulesVersion < 4 || validTowers(c.towers)) && c.maxSeconds === rules.maxSeconds && c.stepSeconds === rules.stepSeconds && c.fieldLimit === rules.fieldLimit
      && Array.isArray(c.slots) && c.slots.length === (c.rulesVersion >= 9 ? ARMY_SLOTS : 4) && c.slots.every(u => u === null || validUnit(u))
      && c.slots.some(u => u !== null) && (c.rulesVersion >= 13 || new Set(c.slots.filter(u => u !== null).map(u => u.id)).size === c.slots.filter(u => u !== null).length)
      && !!c.modifiers && finite(c.modifiers.hpMultiplier, 0.01, 100) && finite(c.modifiers.damageMultiplier, 0.01, 100)
      && !!c.enemy && Array.isArray(c.enemy.units) && c.enemy.units.length > 0 && c.enemy.units.length <= 4
      && c.enemy.units.every(validUnit) && finite(c.enemy.spawnInterval, 0.25, 30 * spawnTimeMultiplier(c.rulesVersion, 'enemy')) && finite(c.enemy.firstSpawn, 0, 30), error);
    if (c.rulesVersion >= 3) {
      const r = c.reward;
      requireRule(integer(c.keepLevel!, 1, MAX_LEVEL) && !!r && r.baseGold === battleGoldReward(b.stage)
        && integer(r.treasuryPercent, 0, 10) && r.treasuryPercent % 2 === 0
        && r.bonusGold === Math.floor(r.baseGold * r.treasuryPercent / 100) && r.totalGold === r.baseGold + r.bonusGold
        && b.paidGold === (b.rewardCollected ? r.totalGold : 0), error);
    }
    requireRule(finite(b.elapsed, 0, c.maxSeconds) && Number.isInteger(b.elapsed / c.stepSeconds)
      && !!b.nextSpawn && Object.keys(b.nextSpawn).length === c.slots.filter(u => u !== null).length
      && c.slots.every((u,i) => u === null || finite(b.nextSpawn[spawnKey(b,i,u.id)]!, 0, c.maxSeconds + u.spawnInterval))
      && finite(b.playerMaxHp, 1, c.rulesVersion >= 7 ? 100000 : 10000) && finite(b.enemyMaxHp, 1)
      && finite(b.playerHp, 0, b.playerMaxHp) && finite(b.enemyHp, 0, b.enemyMaxHp)
      && finite(b.nextEnemy, 0, c.maxSeconds + c.enemy.spawnInterval) && integer(b.spawned, 0, Math.ceil(c.maxSeconds / c.enemy.spawnInterval) + 1)
      && integer(b.playerSpawned, 0) && integer(b.nextId, 1)
      && [null, 'victory', 'defeat', 'draw'].includes(b.result) && (b.result !== null || b.elapsed < c.maxSeconds)
      && b.fighters.length <= (c.rulesVersion >= 5 ? c.fieldLimit * (c.rulesVersion >= 13 ? 10 : 2) : c.fieldLimit + Math.ceil(c.maxSeconds / c.enemy.spawnInterval) + 1)
      && (c.rulesVersion < 5 || ['player', 'enemy'].every(side => capacityUsed(b, side as Fighter['side']) <= c.fieldLimit))
      && new Set(b.fighters.map(f => f.id)).size === b.fighters.length
      && b.fighters.every(f => !!f && definitions.some(u => u.id === f.kind) && ['player', 'enemy'].includes(f.side)
        && (c.rulesVersion < 13 || integer(f.groupId!,1,b.nextId-1) && (f.side !== 'player' || integer(f.slotIndex!,0,4)))
        && validEquipment(f) && integer(f.id, 1, b.nextId - 1) && finite(f.x, 0, 100) && finite(f.maxHp, 1) && finite(f.hp, 0, f.maxHp)
        && finite(f.damage, definition(f.kind).ability.family === 'heal' ? 0 : 0.01) && finite(f.range, 1, 100) && finite(f.speed, 0.01, 100) && finite(f.castleMultiplier, 1, 100)
        && (c.rulesVersion < 5 ? definition(f.kind).starter : validAbility(f, f.kind) && integer(f.attackCount!, 0, Math.ceil(c.maxSeconds / c.stepSeconds) * (c.rulesVersion >= 12 ? 3 : 1)) && finite(f.lastAttackAt!, 0, b.elapsed) && integer(f.lastTarget!, 0, b.nextId - 1) && finite(f.lastTargetX!, 0, 100) && finite(f.slowUntil!, 0, b.elapsed + 2) && finite(f.rallyUntil!, 0, b.elapsed + 2.5))
        && (c.rulesVersion < 3 ? f.kind !== 'medic' : validEffects(f) && finite(f.cooldown!, 0, 3) && finite(f.healingLeft!, 0, f.healBudget!))), error);
  }
  delete (s as Kingdom & {demoReceipts?: unknown}).demoReceipts;
  delete (s as Kingdom & {demoGeneration?: unknown}).demoGeneration;
  s.version = 11;
  return s;
}

export function battleReward(b: Battle) {
  return b.config.reward ?? { baseGold: battleGoldReward(b.stage), treasuryPercent: 0, bonusGold: 0, totalGold: battleGoldReward(b.stage) };
}

export const unitDamagePerSecond = (unit: EffectiveUnit) => Number((unit.damage * (unit.attackInterval ? (unit.damagePeriod ?? 3) / unit.attackInterval : 1)).toFixed(2));

export function healingTarget(fighter: Fighter, fighters: readonly Fighter[]) {
  return fighters.filter(f => f.side === fighter.side && f.kind !== 'medic' && f.hp < f.maxHp && Math.abs(f.x - fighter.x) <= fighter.range)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
}

// Ownership is created only by a paid recruitment command.
export function reconcileUnits(state: Kingdom): Kingdom { return state; }
export const effectiveOwnedUnit = (s: Kingdom, id: string) => {
  const r = s.units[id];
  return applyDoctrine(applyEquipment(applyTowerModifiers(unitStats(r.unitId,1,CURRENT_RULES,libraryModifiers(s), { ...initialUnitProgress(), level:recruitLevel(r) }),s.towers),s.forge.equipped),s.doctrine);
};

export const ENEMY_COMPOSITIONS: readonly (readonly UnitId[])[] = [
  ['swordsman'], ['slinger','slinger','archer'], ['shieldbearer','crossbowman'], ['archer','ranger'],
  ['knight','scout-rider'], ['ram','catapult'], ['swordsman','medic','battle-sage'], ['astral-colossus','spearman','clockwork-gunner'],
];
function legacyEnemyComposition(stage: number): readonly UnitId[] {
  // Introduce counters after the first five onboarding stages; repeat archetypes.
  return stage <= 5 ? ENEMY_COMPOSITIONS[0] : ENEMY_COMPOSITIONS[1 + Math.floor((stage - 6) / 3) % 7];
}

// Ten deliberate formations per chapter. Frontlines screen their ranged/support
// recruits; later chapters reinforce those roles with artillery and elite units.
const CAMPAIGN_FORMATIONS: readonly (readonly UnitId[])[] = [
  ['swordsman'],
  ['swordsman', 'archer'],
  ['swordsman', 'slinger', 'slinger'],
  ['shieldbearer', 'archer', 'swordsman'],
  ['knight', 'swordsman', 'archer'],
  ['shieldbearer', 'crossbowman', 'swordsman'],
  ['swordsman', 'medic', 'archer'],
  ['knight', 'spearman', 'ranger'],
  ['shieldbearer', 'swordsman', 'catapult', 'archer'],
  ['knight', 'swordsman', 'archer', 'medic'],
];
function rules6EnemyComposition(stage: number): readonly UnitId[] {
  const index = (stage - 1) % 10;
  if (stage > 10 && index === 0) return ['shieldbearer', 'crossbowman', 'knight', 'catapult'];
  if (stage > 20 && index === 9) return ['astral-colossus', 'spearman', 'clockwork-gunner', 'medic'];
  return CAMPAIGN_FORMATIONS[index];
}
// Each chapter advances the same class formations by one roster tier.
const CLASS_FORMATIONS: readonly (readonly import('./units.ts').UnitClass[])[] = [
  ['melee'], ['melee','ranged'], ['melee','ranged','ranged'], ['melee','ranged','melee'],
  ['swarm','melee','ranged'], ['melee','ranged','melee'], ['melee','healer','ranged'],
  ['swarm','melee','ranged'], ['melee','melee','siege','ranged'], ['swarm','melee','ranged','healer'],
];
export function enemyComposition(stage: number): readonly UnitId[] {
  const tier = Math.min(5, 1 + Math.floor((stage - 1) / 10));
  return CLASS_FORMATIONS[(stage - 1) % 10].map(c => UNITS.find(u => u.unitClass === c && u.tier === tier)!.id);
}
export const campaignCastleHp = (stage: number) => {
  const chapter = Math.floor((stage - 1) / 10), encounter = (stage - 1) % 10;
  return (140 + encounter * 20) * 3 ** Math.min(chapter, 4) * (1 + Math.max(0, chapter - 4) * .3);
};
function campaignEnemy(stage: number, rulesVersion: RulesVersion): BattleConfiguration['enemy'] {
  const chapter = Math.floor((stage - 1) / 10), encounter = (stage - 1) % 10;
  const tier = rulesVersion >= 7 ? 1 + Math.min(chapter, 4) + encounter * .09 : 1 + chapter * 1.1 + encounter * .09;
  // Keep 1-1 welcoming. From 1-2, stronger individuals resist five-slot starter
  // armies without adding more enemies to the field. See early-battle-balance.json.
  const power = rulesVersion >= 14 && stage > 1 ? 3 : 1;
  return {
    units: (rulesVersion >= 7 ? enemyComposition(stage) : rules6EnemyComposition(stage)).map(id => {
      const unit = unitStats(id, tier, rulesVersion, NO_BATTLE_MODIFIERS, initialUnitProgress(), 'enemy');
      return { ...unit, hp: Math.round(unit.hp * power), damage: unit.damage * power,
        healPerSecond: unit.healPerSecond! * power, healBudget: unit.healBudget! * power };
    }),
    spawnInterval: (stage === 1 ? 16.5 : rulesVersion >= 7 ? Math.max(2.5, 6 - encounter * .25) : Math.max(1.5, 6 - chapter - encounter * .13)) * spawnTimeMultiplier(rulesVersion, 'enemy'),
    firstSpawn: (stage === 1 ? 9 : 3) * spawnTimeMultiplier(rulesVersion, 'enemy'),
  };
}
