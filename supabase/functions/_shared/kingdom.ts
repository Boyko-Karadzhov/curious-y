import { createLearningReward, KNOWLEDGE_RESOURCES, type LearningReward } from './resources.ts';

export const TOPICS = ['Physics', 'Mathematics & Logic', 'Chemistry', 'Life', 'Computer Science', 'Earth & Space', 'Mind & Behavior', 'Society & History'] as const;
export type TopicName = typeof TOPICS[number];

export const MAX_LEVEL = 5;
export const stageLabel = (stage: number) => `${Math.floor((stage - 1) / 10) + 1}-${(stage - 1) % 10 + 1}`;
const difficulty = (stage: number) => 1 + (stage - 1) / 10;
export const battleGoldReward = (stage: number) => 60 + (stage - 1) * 10;
export const ARMY_LIMIT = 24;
export const ARMY_SLOTS = 4;
// Rules are immutable compatibility contracts. New tuning gets a new version.
export const BATTLE_RULES = {
  1: { maxSeconds: 120, stepSeconds: 0.25, fieldLimit: ARMY_LIMIT, tempo: 1 },
  2: { maxSeconds: 90, stepSeconds: 0.25, fieldLimit: ARMY_LIMIT, tempo: 1 / 3 },
} as const;
export type RulesVersion = keyof typeof BATTLE_RULES;
export const CURRENT_RULES: RulesVersion = 2;
export const BUILDINGS = [
  { id: 'barracks', name: 'Barracks', unitId: 'swordsman', unit: 'Swordsman', symbol: '⚔', unlock: 1, cost: 20 },
  { id: 'range', name: 'Archery Range', unitId: 'archer', unit: 'Archer', symbol: '➶', unlock: 1, cost: 30 },
  { id: 'stable', name: 'Stable', unitId: 'knight', unit: 'Knight', symbol: '♞', unlock: 2, cost: 40 },
  { id: 'workshop', name: 'Siege Workshop', unitId: 'catapult', unit: 'Catapult', symbol: '◉', unlock: 3, cost: 60 },
] as const;
export type BuildingId = typeof BUILDINGS[number]['id'];
// Unit identity and combat data are independent of construction identity.
export const UNITS = [
  { id: 'swordsman', name: 'Swordsman', building: 'barracks', spawnInterval: 1.5, hp: 65, damage: 12, range: 3, speed: 7, castleMultiplier: 1, role: 'Steady frontline infantry' },
  { id: 'archer', name: 'Archer', building: 'range', spawnInterval: 2, hp: 32, damage: 15, range: 18, speed: 6, castleMultiplier: 1, role: 'Ranged support behind your frontline' },
  { id: 'knight', name: 'Knight', building: 'stable', spawnInterval: 3, hp: 140, damage: 20, range: 3, speed: 10, castleMultiplier: 1, role: 'Fast, durable cavalry' },
  { id: 'catapult', name: 'Catapult', building: 'workshop', spawnInterval: 4, hp: 55, damage: 18, range: 25, speed: 3, castleMultiplier: 3, role: 'Long range; triple damage to the enemy castle' },
] as const;
export type UnitId = typeof UNITS[number]['id'];
export type ArmySlots = [UnitId | null, UnitId | null, UnitId | null, UnitId | null];
export interface PassiveBattleModifiers { hpMultiplier: number; damageMultiplier: number }
export const NO_BATTLE_MODIFIERS: PassiveBattleModifiers = { hpMultiplier: 1, damageMultiplier: 1 };
export interface EffectiveUnit {
  id: UnitId; hp: number; damage: number; range: number; speed: number; spawnInterval: number; castleMultiplier: number;
}
export interface BattleConfiguration {
  rulesVersion: RulesVersion; maxSeconds: number; stepSeconds: number; fieldLimit: number;
  slots: (EffectiveUnit | null)[]; modifiers: PassiveBattleModifiers;
  enemy: { units: EffectiveUnit[]; spawnInterval: number; firstSpawn: number };
}
export interface Fighter {
  id: number; kind: UnitId; side: 'player' | 'enemy'; x: number;
  hp: number; maxHp: number; damage: number; range: number; speed: number; castleMultiplier: number;
}
export interface Battle {
  rewardCollected: boolean;
  config: BattleConfiguration;
  stage: number; elapsed: number; nextSpawn: Partial<Record<UnitId, number>>; nextEnemy: number; spawned: number; playerSpawned: number; nextId: number;
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
export interface Kingdom {
  version: 2; armySlots: ArmySlots; gold: number; tokens: Record<TopicName, number>; castle: number;
  buildings: Record<BuildingId, number>; rewarded: string[]; cleared: number; battle: Battle | null;
}
export type Action =
  // Only demo code may submit answer rewards; live rewards are a SQL transaction.
  | { type: 'answer'; id: string; topic: string; correct: boolean; reward?: LearningReward }
  | { type: 'castle' }
  | { type: 'building'; id: BuildingId }
  | { type: 'army'; slots: ArmySlots }
  | { type: 'start'; stage: number }
  | { type: 'collect-battle'; stage: number }
  | { type: 'tick' }
  | { type: 'retreat' };
export interface KingdomSnapshot { state: Kingdom; revision: number; generation: number }

export function newKingdom(): Kingdom {
  return { version: 2, armySlots: [null, null, null, null], gold: 0, tokens: Object.fromEntries(TOPICS.map(t => [t, 0])) as Record<TopicName, number>,
    castle: 1, buildings: { barracks: 0, range: 0, stable: 0, workshop: 0 }, rewarded: [], cleared: 0, battle: null };
}
export const castleHp = (level: number) => 240 + (level - 1) * 120;
export interface UpgradeCost { gold: number; resources: Partial<Record<TopicName, number>> }
export const castleCost = (level: number): UpgradeCost => ({
  gold: level * 60, resources: { 'Mathematics & Logic': level * 10, 'Society & History': level * 10 },
});
export const buildingCost = (id: BuildingId, level: number): UpgradeCost => {
  const amount = BUILDINGS.find(b => b.id === id)!.cost / 2 * (level + 1);
  const topics: Record<BuildingId, TopicName[]> = {
    barracks: ['Physics'], range: ['Earth & Space', 'Mind & Behavior'],
    stable: ['Life', 'Chemistry'], workshop: ['Computer Science', 'Physics'],
  };
  return { gold: level * 20, resources: Object.fromEntries(topics[id].map(topic => [topic, amount])) };
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
  const spec = action.type === 'building' ? BUILDINGS.find(b => b.id === action.id) : undefined;
  const level = action.type === 'castle' ? state.castle : spec ? state.buildings[spec.id] : 0;
  const cost = action.type === 'castle' ? castleCost(level) : spec ? buildingCost(spec.id, level) : { gold: 0, resources: {} };
  const requiredCastle = spec ? Math.max(spec.unlock, level + 1) : 0;
  const blocker = action.type === 'building' && !spec ? 'Unknown building.'
    : level >= MAX_LEVEL ? 'Already at maximum level.'
    : state.battle && !state.battle.result ? 'Finish or retreat from the battle before upgrading.'
    : spec && state.castle < requiredCastle ? `Requires Castle level ${requiredCastle}.` : null;
  const affordable = canAfford(state, cost);
  return { cost, missing: missingCost(state, cost), requiredCastle, blocker, affordable, ready: !blocker && affordable };
}
function spend(state: Kingdom, cost: UpgradeCost) {
  requireRule(canAfford(state, cost), `You need ${formatCost(missingCost(state, cost))} more.`);
  state.gold -= cost.gold;
  for (const topic of TOPICS) state.tokens[topic] -= cost.resources[topic] ?? 0;
}
export const unitStats = (id: UnitId, level: number, rulesVersion: RulesVersion = CURRENT_RULES,
  modifiers: PassiveBattleModifiers = NO_BATTLE_MODIFIERS): EffectiveUnit => {
  const spec = UNITS.find(u => u.id === id)!;
  const multiplier = 1 + (level - 1) * 0.3;
  const tempo = BATTLE_RULES[rulesVersion].tempo;
  return { id, hp: Math.round(spec.hp * multiplier * modifiers.hpMultiplier),
    damage: Number((Math.round(spec.damage * multiplier) * modifiers.damageMultiplier * tempo).toFixed(6)),
    range: spec.range, speed: spec.speed * tempo, spawnInterval: spec.spawnInterval / tempo, castleMultiplier: spec.castleMultiplier };
};
const active = (s: Kingdom) => s.battle !== null && s.battle.result === null;
const requireRule = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
export const eligibleUnit = (s: Kingdom, id: UnitId) => {
  const unit = UNITS.find(u => u.id === id);
  return !!unit && s.buildings[unit.building] > 0;
};
export const hasBattleReward = (s: Kingdom) => s.battle?.result === 'victory' && s.battle.rewardCollected === false;
// Legacy ownership maps only these four original unlocks, never a future roster.
export const defaultArmy = (s: Kingdom): ArmySlots => BUILDINGS.map(b => eligibleUnit(s, b.unitId) ? b.unitId : null) as ArmySlots;
export function validateArmy(s: Kingdom, slots: unknown): asserts slots is ArmySlots {
  requireRule(Array.isArray(slots) && slots.length === ARMY_SLOTS
    && slots.every(id => id === null || eligibleUnit(s, id))
    && new Set(slots.filter(id => id !== null)).size === slots.filter(id => id !== null).length,
  'Choose four slots with no duplicate or ineligible units. Construct a building to unlock its unit.');
}
function spawn(battle: Battle, spec: EffectiveUnit, side: Fighter['side']) {
  battle.fighters.push({ id: battle.nextId++, kind: spec.id, side, x: side === 'player' ? 5 : 95,
    hp: spec.hp, maxHp: spec.hp, damage: spec.damage, range: spec.range, speed: spec.speed, castleMultiplier: spec.castleMultiplier });
}
function battleConfiguration(s: Kingdom, stage: number, rulesVersion: RulesVersion): BattleConfiguration {
  const rules = BATTLE_RULES[rulesVersion];
  const strength = difficulty(stage);
  const modifiers = { ...NO_BATTLE_MODIFIERS };
  return { rulesVersion, maxSeconds: rules.maxSeconds, stepSeconds: rules.stepSeconds, fieldLimit: rules.fieldLimit,
    slots: s.armySlots.map(id => id ? unitStats(id, s.buildings[UNITS.find(u => u.id === id)!.building], rulesVersion, modifiers) : null),
    modifiers,
    enemy: { units: UNITS.slice(0, Math.min(4, Math.floor(strength))).map(u => unitStats(u.id, Math.max(1, strength - 1), rulesVersion)),
      spawnInterval: Math.max(2.75, 6 - strength * 0.5) / rules.tempo, firstSpawn: 3 / rules.tempo } };
}
// Preview uses exactly the same configuration as Start, including the opponent.
export function createBattle(s: Kingdom, stage = s.cleared + 1): Battle {
  validateArmy(s, s.armySlots);
  const config = battleConfiguration(s, stage, CURRENT_RULES);
  const enemyHp = 140 + (stage - 1) * 10;
  return { config, stage, rewardCollected: false, elapsed: 0, nextSpawn: Object.fromEntries(config.slots.filter(u => u !== null).map(u => [u.id, 0])),
    nextEnemy: config.enemy.firstSpawn, spawned: 0, playerSpawned: 0, nextId: 1,
    playerHp: castleHp(s.castle), playerMaxHp: castleHp(s.castle), enemyHp, enemyMaxHp: enemyHp, fighters: [], result: null };
}
function recruit(s: Kingdom) {
  const b = s.battle!;
  let count = b.fighters.filter(f => f.side === 'player').length;
  // Oldest due slot wins; slot order breaks ties. Missed spawns never accumulate.
  const due = b.config.slots.filter((spec): spec is EffectiveUnit => spec !== null && b.nextSpawn[spec.id]! <= b.elapsed)
    .sort((a, c) => b.nextSpawn[a.id]! - b.nextSpawn[c.id]!);
  for (const spec of due) {
    if (count >= b.config.fieldLimit) break;
    spawn(b, spec, 'player');
    b.nextSpawn[spec.id] = b.elapsed + spec.spawnInterval;
    b.playerSpawned++;
    count++;
  }
}

// Fixed simulation step: deterministic, simultaneous damage, bounded duration and unit count.
function tick(s: Kingdom) {
  const b = s.battle!;
  const dt = b.config.stepSeconds;
  b.elapsed += dt;
  recruit(s);
  if (b.elapsed >= b.nextEnemy) {
    const enemy = b.config.enemy;
    spawn(b, enemy.units[b.spawned % enemy.units.length], 'enemy');
    b.spawned++;
    b.nextEnemy += enemy.spawnInterval;
  }
  const damage = new Map<number, number>();
  const positions = new Map<number, number>();
  for (const fighter of b.fighters) {
    const direction = fighter.side === 'player' ? 1 : -1;
    const target = nearestOpponent(fighter, b.fighters);
    const distance = target ? Math.abs(target.x - fighter.x) : Infinity;
    if (target && distance <= fighter.range) {
      damage.set(target.id, (damage.get(target.id) || 0) + fighter.damage * dt);
    } else if (Math.abs((fighter.side === 'player' ? 100 : 0) - fighter.x) <= fighter.range) {
      const hit = fighter.damage * dt * fighter.castleMultiplier;
      if (fighter.side === 'player') b.enemyHp -= hit;
      else b.playerHp -= hit;
    } else {
      // Stop at the enemy's frontline; fast units cannot pass through defenders.
      const travel = Math.min(fighter.speed * dt, Math.max(0, distance - 2));
      positions.set(fighter.id, Math.max(0, Math.min(100, fighter.x + direction * travel)));
    }
  }
  b.fighters = b.fighters.map(f => ({ ...f, hp: f.hp - (damage.get(f.id) || 0), x: positions.get(f.id) ?? f.x })).filter(f => f.hp > 0);
  b.playerHp = Math.max(0, b.playerHp);
  b.enemyHp = Math.max(0, b.enemyHp);
  if (b.playerHp === 0 && b.enemyHp === 0) b.result = 'draw';
  else if (b.enemyHp === 0) b.result = 'victory';
  else if (b.playerHp === 0) b.result = 'defeat';
  else if (b.elapsed >= b.config.maxSeconds) b.result = 'draw';
  if (b.result === 'victory' && b.stage > s.cleared) {
    s.cleared = Math.max(s.cleared, b.stage);
  }
}

export function applyAction(state: Kingdom, action: Action): Kingdom {
  const s = structuredClone(state);
  switch (action.type) {
    case 'answer': {
      requireRule(!!action.id && TOPICS.includes(action.topic as TopicName), 'This question needs a supported topic before it can earn resources.');
      if (s.rewarded.includes(action.id)) return state;
      // The optional fallback supports old Demo commands only. Live commands reject answer.
      const reward = action.reward ?? createLearningReward(action.id, action.correct, null, action.topic);
      requireRule(reward.id === action.id && reward.lines.length > 0
        && reward.lines.every(line => KNOWLEDGE_RESOURCES.some(r => r.key === line.key)
          && Number.isSafeInteger(line.amount) && line.amount > 0)
        && new Set(reward.lines.map(line => line.key)).size === reward.lines.length
        && reward.lines.reduce((sum, line) => sum + line.amount, 0) === reward.totalKnowledge,
      'Invalid reward breakdown.');
      for (const line of reward.lines) s.tokens[KNOWLEDGE_RESOURCES.find(r => r.key === line.key)!.topic] += line.amount;
      s.rewarded.push(action.id);
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
      requireRule(s.armySlots.some(id => id !== null), 'Equip at least one eligible unit. Build a military building to unlock your first unit.');
      requireRule(Number.isSafeInteger(action.stage) && action.stage === s.cleared + 1, 'Fight the next unbeaten battle. Win the previous battle before advancing.');
      s.battle = createBattle(s, action.stage);
      recruit(s);
      break;
    }
    case 'collect-battle': {
      requireRule(s.battle?.result === 'victory' && s.battle.stage === action.stage, 'There is no reward for this battle.');
      if (s.battle!.rewardCollected) return state;
      s.gold += battleGoldReward(s.battle!.stage);
      s.battle!.rewardCollected = true;
      break;
    }
    case 'tick':
      if (!active(s)) return state;
      tick(s);
      break;
    case 'retreat':
      requireRule(active(s), 'There is no active battle.');
      s.battle!.result = 'defeat';
      break;
    default: throw new Error('Unsupported Castle command.');
  }
  return s;
}

// Conversion only recognizes the old schema; damaged modern snapshots never
// silently fall back to defaults. Callers write only after a successful command.
export function parseKingdom(raw: string): Kingdom {
  const unreadable = 'Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.';
  let s: Kingdom;
  try { s = JSON.parse(raw); } catch { throw new Error(unreadable); }
  const integer = (n: number, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
  const finite = (n: number, min: number, max = Number.MAX_VALUE) => Number.isFinite(n) && n >= min && n <= max;
  const legacy = (s as unknown as { version?: number })?.version === 1;
  requireRule(!!s && (legacy || s.version === 2) && integer(s.gold, 0) && integer(s.castle, 1, MAX_LEVEL)
    && integer(s.cleared, 0, Number.MAX_SAFE_INTEGER - 1) && !!s.tokens && TOPICS.every(t => integer(s.tokens[t], 0))
    && !!s.buildings && BUILDINGS.every(b => integer(s.buildings[b.id], 0, s.castle) && (s.buildings[b.id] === 0 || s.castle >= b.unlock))
    && Array.isArray(s.rewarded) && s.rewarded.every(id => typeof id === 'string'), unreadable);
  if (legacy && s.armySlots === undefined) s.armySlots = defaultArmy(s);
  validateArmy(s, s.armySlots);
  if (s.battle !== null) {
    const b = s.battle;
    const error = 'Battle save could not be read. Your stored data has been preserved.';
    requireRule(!!b && integer(b.stage, 1) && Array.isArray(b.fighters), error);
    // Victories saved before explicit collection already credited their Gold.
    if (b.rewardCollected === undefined) b.rewardCollected = b.result === 'victory';
    requireRule(typeof b.rewardCollected === 'boolean' && (!b.rewardCollected || b.result === 'victory'), error);
    if (legacy && b.config === undefined) {
      b.config = battleConfiguration({ ...s, armySlots: defaultArmy(s) }, b.stage, 1);
      b.playerSpawned ??= 0;
      const oldTimers = b.nextSpawn as Partial<Record<BuildingId, number>> | undefined;
      b.nextSpawn = Object.fromEntries(b.config.slots.filter(u => u !== null).map(u =>
        [u.id, oldTimers === undefined ? b.elapsed + u.spawnInterval : oldTimers[UNITS.find(spec => spec.id === u.id)!.building]]));
      for (const f of b.fighters) {
        const unit = UNITS.find(u => u.building === String(f.kind));
        requireRule(!!unit, error);
        f.kind = unit!.id;
        f.castleMultiplier = unit!.castleMultiplier;
      }
      delete (b as Battle & { supply?: number }).supply;
    }
    const c = b.config;
    const rules = c && BATTLE_RULES[c.rulesVersion];
    const validUnit = (u: EffectiveUnit) => !!u && UNITS.some(spec => spec.id === u.id)
      && finite(u.hp, 1) && finite(u.damage, 0.01) && finite(u.range, 1, 100) && finite(u.speed, 0.01, 100)
      && finite(u.spawnInterval, 0.25, 30) && finite(u.castleMultiplier, 1, 100);
    requireRule(!!rules && c.maxSeconds === rules.maxSeconds && c.stepSeconds === rules.stepSeconds && c.fieldLimit === rules.fieldLimit
      && Array.isArray(c.slots) && c.slots.length === ARMY_SLOTS && c.slots.every(u => u === null || validUnit(u))
      && c.slots.some(u => u !== null) && new Set(c.slots.filter(u => u !== null).map(u => u.id)).size === c.slots.filter(u => u !== null).length
      && !!c.modifiers && finite(c.modifiers.hpMultiplier, 0.01, 100) && finite(c.modifiers.damageMultiplier, 0.01, 100)
      && !!c.enemy && Array.isArray(c.enemy.units) && c.enemy.units.length > 0 && c.enemy.units.length <= ARMY_SLOTS
      && c.enemy.units.every(validUnit) && finite(c.enemy.spawnInterval, 0.25, 30) && finite(c.enemy.firstSpawn, 0, 30), error);
    requireRule(finite(b.elapsed, 0, c.maxSeconds) && Number.isInteger(b.elapsed / c.stepSeconds)
      && !!b.nextSpawn && Object.keys(b.nextSpawn).length === c.slots.filter(u => u !== null).length
      && c.slots.every(u => u === null || finite(b.nextSpawn[u.id]!, 0, c.maxSeconds + u.spawnInterval))
      && finite(b.playerMaxHp, 1, 10000) && finite(b.enemyMaxHp, 1)
      && finite(b.playerHp, 0, b.playerMaxHp) && finite(b.enemyHp, 0, b.enemyMaxHp)
      && finite(b.nextEnemy, 0, c.maxSeconds + c.enemy.spawnInterval) && integer(b.spawned, 0, Math.ceil(c.maxSeconds / c.enemy.spawnInterval) + 1)
      && integer(b.playerSpawned, 0) && integer(b.nextId, 1)
      && [null, 'victory', 'defeat', 'draw'].includes(b.result) && (b.result !== null || b.elapsed < c.maxSeconds)
      && b.fighters.length <= c.fieldLimit + Math.ceil(c.maxSeconds / c.enemy.spawnInterval) + 1
      && new Set(b.fighters.map(f => f.id)).size === b.fighters.length
      && b.fighters.every(f => !!f && UNITS.some(u => u.id === f.kind) && ['player', 'enemy'].includes(f.side)
        && integer(f.id, 1, b.nextId - 1) && finite(f.x, 0, 100) && finite(f.maxHp, 1) && finite(f.hp, 0, f.maxHp)
        && finite(f.damage, 0.01) && finite(f.range, 1, 100) && finite(f.speed, 0.01, 100) && finite(f.castleMultiplier, 1, 100)), error);
  }
  s.version = 2;
  return s;
}
