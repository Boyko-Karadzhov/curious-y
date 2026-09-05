import { KNOWLEDGE_RESOURCES } from './resources.ts';

export const TOPICS = ['Physics', 'Mathematics & Logic', 'Chemistry', 'Life', 'Computer Science', 'Earth & Space', 'Mind & Behavior', 'Society & History'] as const;
export type TopicName = typeof TOPICS[number];

export const MAX_LEVEL = 5;
export const stageLabel = (stage: number) => `${Math.floor((stage - 1) / 10) + 1}-${(stage - 1) % 10 + 1}`;
const difficulty = (stage: number) => 1 + (stage - 1) / 10;
export const battleGoldReward = (stage: number) => 60 + (stage - 1) * 10;
export const ARMY_LIMIT = 24;
export const BUILDINGS = [
  { id: 'barracks', name: 'Barracks', unit: 'Swordsman', symbol: '⚔', unlock: 1, cost: 20, spawnInterval: 1.5, hp: 65, damage: 12, range: 3, speed: 7, role: 'Steady frontline infantry' },
  { id: 'range', name: 'Archery Range', unit: 'Archer', symbol: '➶', unlock: 1, cost: 30, spawnInterval: 2, hp: 32, damage: 15, range: 18, speed: 6, role: 'Ranged support behind your frontline' },
  { id: 'stable', name: 'Stable', unit: 'Knight', symbol: '♞', unlock: 2, cost: 40, spawnInterval: 3, hp: 140, damage: 20, range: 3, speed: 10, role: 'Fast, durable cavalry' },
  { id: 'workshop', name: 'Siege Workshop', unit: 'Catapult', symbol: '◉', unlock: 3, cost: 60, spawnInterval: 4, hp: 55, damage: 18, range: 25, speed: 3, role: 'Long range; triple damage to the enemy castle' },
] as const;
export type BuildingId = typeof BUILDINGS[number]['id'];
export interface Fighter {
  id: number; kind: BuildingId; side: 'player' | 'enemy'; x: number;
  hp: number; maxHp: number; damage: number; range: number; speed: number;
}
export interface Battle {
  stage: number; elapsed: number; nextSpawn: Record<BuildingId, number>; nextEnemy: number; spawned: number; playerSpawned: number; nextId: number;
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
  version: 1; gold: number; tokens: Record<TopicName, number>; castle: number;
  buildings: Record<BuildingId, number>; rewarded: string[]; cleared: number; battle: Battle | null;
}
export type Action =
  // Only demo code may submit answer rewards; live rewards are a SQL transaction.
  | { type: 'answer'; id: string; topic: string; correct: boolean }
  | { type: 'castle' }
  | { type: 'building'; id: BuildingId }
  | { type: 'start'; stage: number }
  | { type: 'tick' }
  | { type: 'retreat' };
export interface KingdomSnapshot { state: Kingdom; revision: number; generation: number }

export function newKingdom(): Kingdom {
  return { version: 1, gold: 0, tokens: Object.fromEntries(TOPICS.map(t => [t, 0])) as Record<TopicName, number>,
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
export const unitStats = (id: BuildingId, level: number) => {
  const spec = BUILDINGS.find(b => b.id === id)!;
  const multiplier = 1 + (level - 1) * 0.3;
  return { hp: Math.round(spec.hp * multiplier), damage: Math.round(spec.damage * multiplier) };
};
const active = (s: Kingdom) => s.battle !== null && s.battle.result === null;
const requireRule = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };

function spawn(battle: Battle, id: BuildingId, side: Fighter['side'], level: number) {
  const spec = BUILDINGS.find(b => b.id === id)!;
  const stats = unitStats(id, level);
  battle.fighters.push({ id: battle.nextId++, kind: id, side, x: side === 'player' ? 5 : 95,
    hp: stats.hp, maxHp: stats.hp, damage: stats.damage, range: spec.range, speed: spec.speed });
}

// Also used to show the battlefield before the player presses Start.
export function createBattle(s: Kingdom, stage = s.cleared + 1): Battle {
  const enemyHp = 140 + (stage - 1) * 10;
  return { stage, elapsed: 0, nextSpawn: { barracks: 0, range: 0, stable: 0, workshop: 0 },
    nextEnemy: 3, spawned: 0, playerSpawned: 0, nextId: 1,
    playerHp: castleHp(s.castle), playerMaxHp: castleHp(s.castle), enemyHp, enemyMaxHp: enemyHp, fighters: [], result: null };
}

function recruit(s: Kingdom) {
  const b = s.battle!;
  let count = b.fighters.filter(f => f.side === 'player').length;
  // Oldest due unit gets the next available space; missed spawns do not accumulate.
  const due = BUILDINGS.filter(spec => s.buildings[spec.id] > 0 && b.nextSpawn[spec.id] <= b.elapsed)
    .sort((a, c) => b.nextSpawn[a.id] - b.nextSpawn[c.id]);
  for (const spec of due) {
    if (count >= ARMY_LIMIT) break;
    spawn(b, spec.id, 'player', s.buildings[spec.id]);
    b.nextSpawn[spec.id] = b.elapsed + spec.spawnInterval;
    b.playerSpawned++;
    count++;
  }
}

// Fixed simulation step: deterministic, simultaneous damage, bounded duration and unit count.
function tick(s: Kingdom) {
  const b = s.battle!;
  const dt = 0.25;
  b.elapsed += dt;
  recruit(s);
  if (b.elapsed >= b.nextEnemy) {
    const strength = difficulty(b.stage);
    const pool = BUILDINGS.slice(0, Math.min(4, Math.floor(strength)));
    spawn(b, pool[b.spawned % pool.length].id, 'enemy', Math.max(1, strength - 1));
    b.spawned++;
    b.nextEnemy += Math.max(2.75, 6 - strength * 0.5);
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
      const hit = fighter.damage * dt * (fighter.kind === 'workshop' ? 3 : 1);
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
  else if (b.elapsed >= 120) b.result = 'draw';
  if (b.result === 'victory') {
    s.gold += battleGoldReward(b.stage);
    s.cleared = Math.max(s.cleared, b.stage);
  }
}

export function applyAction(state: Kingdom, action: Action): Kingdom {
  const s = structuredClone(state);
  switch (action.type) {
    case 'answer': {
      requireRule(!!action.id && TOPICS.includes(action.topic as TopicName), 'This question needs a supported topic before it can earn resources.');
      if (s.rewarded.includes(action.id)) return state;
      s.tokens[action.topic as TopicName] += action.correct ? 10 : 3;
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
    case 'start': {
      requireRule(!active(s), 'A battle is already in progress.');
      requireRule(BUILDINGS.some(b => s.buildings[b.id] > 0), 'Build a military building to unlock your first unit.');
      requireRule(Number.isSafeInteger(action.stage) && action.stage === s.cleared + 1, 'Fight the next unbeaten battle. Win the previous battle before advancing.');
      s.battle = createBattle(s, action.stage);
      recruit(s);
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

// Reject damaged or incompatible saves rather than silently deleting a player's progress.
export function parseKingdom(raw: string): Kingdom {
  let s: Kingdom;
  try { s = JSON.parse(raw) as Kingdom; }
  catch { throw new Error('Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.'); }
  const integer = (n: number, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= min && n <= max;
  const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
  requireRule(!!s && s.version === 1 && integer(s.gold, 0) && integer(s.castle, 1, MAX_LEVEL)
    && integer(s.cleared, 0, Number.MAX_SAFE_INTEGER - 1) && !!s.tokens && TOPICS.every(t => integer(s.tokens[t], 0))
    && !!s.buildings && BUILDINGS.every(b => integer(s.buildings[b.id], 0, s.castle) && (s.buildings[b.id] === 0 || s.castle >= b.unlock))
    && Array.isArray(s.rewarded) && s.rewarded.every(id => typeof id === 'string'), 'Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.');
  if (s.battle !== null) {
    const b = s.battle;
    // Preserve old battles and progress while replacing the shared supply pool with timers.
    if (b && b.playerSpawned === undefined) b.playerSpawned = 0;
    if (b && b.nextSpawn === undefined) b.nextSpawn = Object.fromEntries(BUILDINGS.map(spec => [spec.id, b.elapsed + spec.spawnInterval])) as Record<BuildingId, number>;
    if (b) delete (b as Battle & { supply?: number }).supply;
    requireRule(!!b && integer(b.stage, 1) && finite(b.elapsed, 0, 120)
      && !!b.nextSpawn && BUILDINGS.every(spec => finite(b.nextSpawn[spec.id], 0, 124))
      && finite(b.playerMaxHp, 1, 10000) && finite(b.enemyMaxHp, 1, Number.MAX_VALUE)
      && finite(b.playerHp, 0, b.playerMaxHp) && finite(b.enemyHp, 0, b.enemyMaxHp)
      && finite(b.nextEnemy, 0, 130) && integer(b.spawned, 0, 100) && integer(b.playerSpawned, 0) && integer(b.nextId, 1)
      && [null, 'victory', 'defeat', 'draw'].includes(b.result) && Array.isArray(b.fighters) && b.fighters.length <= 100
      && b.fighters.every(f => BUILDINGS.some(spec => spec.id === f.kind) && ['player', 'enemy'].includes(f.side)
        && integer(f.id, 1) && finite(f.x, 0, 100) && finite(f.maxHp, 1, Number.MAX_VALUE) && finite(f.hp, 0, f.maxHp)
        && finite(f.damage, 1, Number.MAX_VALUE) && finite(f.range, 1, 100) && finite(f.speed, 1, 100)), 'Battle save could not be read. Your stored data has been preserved.');
  }
  return s;
}
