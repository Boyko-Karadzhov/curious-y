export const TOPICS = ['Physics', 'Mathematics & Logic', 'Chemistry', 'Life', 'Computer Science', 'Earth & Space', 'Mind & Behavior', 'Society & History'] as const;
export type TopicName = typeof TOPICS[number];

export const MAX_LEVEL = 5;
export const CAMPAIGN = ['Meadow Outpost', 'River Crossing', 'Stonewatch', 'Iron Frontier', 'The Citadel'];
export const GOLD_PER_TOKEN = 2;
export const ARMY_LIMIT = 24;
export const BUILDINGS = [
  { id: 'barracks', name: 'Barracks', unit: 'Swordsman', symbol: '⚔', unlock: 1, cost: 20, supply: 3, hp: 65, damage: 12, range: 3, speed: 7, role: 'Steady frontline infantry' },
  { id: 'range', name: 'Archery Range', unit: 'Archer', symbol: '➶', unlock: 1, cost: 30, supply: 4, hp: 32, damage: 15, range: 18, speed: 6, role: 'Ranged support behind your frontline' },
  { id: 'stable', name: 'Stable', unit: 'Knight', symbol: '♞', unlock: 2, cost: 40, supply: 6, hp: 140, damage: 20, range: 3, speed: 10, role: 'Fast, durable cavalry' },
  { id: 'workshop', name: 'Siege Workshop', unit: 'Catapult', symbol: '◉', unlock: 3, cost: 60, supply: 8, hp: 55, damage: 18, range: 25, speed: 3, role: 'Long range; triple damage to the enemy castle' },
] as const;
export type BuildingId = typeof BUILDINGS[number]['id'];
export interface Fighter {
  id: number; kind: BuildingId; side: 'player' | 'enemy'; x: number;
  hp: number; maxHp: number; damage: number; range: number; speed: number;
}
export interface Battle {
  stage: number; elapsed: number; supply: number; nextEnemy: number; spawned: number; playerSpawned: number; nextId: number;
  playerHp: number; playerMaxHp: number; enemyHp: number; enemyMaxHp: number;
  fighters: Fighter[]; result: 'victory' | 'defeat' | 'draw' | null;
}
export interface Kingdom {
  version: 1; gold: number; tokens: Record<TopicName, number>; castle: number;
  buildings: Record<BuildingId, number>; rewarded: string[]; cleared: number; battle: Battle | null;
}
export type Action =
  // Only demo code may submit answer rewards; live rewards are a SQL transaction.
  | { type: 'answer'; id: string; topic: string; correct: boolean }
  | { type: 'exchange'; topic: TopicName }
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
export const castleCost = (level: number) => level * 60;
export const buildingCost = (id: BuildingId, level: number) => BUILDINGS.find(b => b.id === id)!.cost * (level + 1);
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

export function nextRecruit(s: Kingdom) {
  const pool = BUILDINGS.filter(spec => s.buildings[spec.id] > 0);
  return pool.length ? pool[(s.battle?.playerSpawned ?? 0) % pool.length] : undefined;
}

function recruit(s: Kingdom) {
  const b = s.battle!;
  let count = b.fighters.filter(f => f.side === 'player').length;
  while (count < ARMY_LIMIT) {
    const spec = nextRecruit(s);
    // Save for the next unit instead of letting cheap infantry starve other buildings.
    if (!spec || b.supply < spec.supply) break;
    b.supply -= spec.supply;
    spawn(b, spec.id, 'player', s.buildings[spec.id]);
    b.playerSpawned++;
    count++;
  }
}

// Fixed simulation step: deterministic, simultaneous damage, bounded duration and unit count.
function tick(s: Kingdom) {
  const b = s.battle!;
  const dt = 0.25;
  b.elapsed += dt;
  b.supply = Math.min(20, b.supply + dt * 2);
  recruit(s);
  if (b.elapsed >= b.nextEnemy) {
    const pool = BUILDINGS.slice(0, Math.min(4, b.stage));
    spawn(b, pool[b.spawned % pool.length].id, 'enemy', Math.max(1, b.stage - 1));
    b.spawned++;
    b.nextEnemy += Math.max(2.75, 6 - b.stage * 0.5);
  }
  const damage = new Map<number, number>();
  const positions = new Map<number, number>();
  for (const fighter of b.fighters) {
    const direction = fighter.side === 'player' ? 1 : -1;
    const opponents = b.fighters.filter(f => f.side !== fighter.side);
    const target = opponents.sort((a, c) => Math.abs(a.x - fighter.x) - Math.abs(c.x - fighter.x))[0];
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
  if (b.result === 'victory') s.cleared = Math.max(s.cleared, b.stage);
}

export function applyAction(state: Kingdom, action: Action): Kingdom {
  const s = structuredClone(state);
  switch (action.type) {
    case 'answer': {
      requireRule(!!action.id && TOPICS.includes(action.topic as TopicName), 'This question needs a supported topic before it can earn tokens.');
      if (s.rewarded.includes(action.id)) return state;
      s.tokens[action.topic as TopicName] += action.correct ? 10 : 3;
      s.rewarded.push(action.id);
      break;
    }
    case 'exchange': {
      const amount = s.tokens[action.topic];
      requireRule(Number.isSafeInteger(amount) && amount > 0, 'Answer a question in this topic to earn tokens first.');
      s.gold += amount * GOLD_PER_TOKEN;
      s.tokens[action.topic] = 0;
      break;
    }
    case 'castle': {
      requireRule(!active(s), 'Finish or retreat from the battle before upgrading.');
      requireRule(s.castle < MAX_LEVEL, 'Castle is at maximum level.');
      const cost = castleCost(s.castle);
      requireRule(s.gold >= cost, `You need ${cost - s.gold} more Gold.`);
      s.gold -= cost; s.castle++;
      break;
    }
    case 'building': {
      requireRule(!active(s), 'Finish or retreat from the battle before building.');
      const spec = BUILDINGS.find(b => b.id === action.id);
      requireRule(!!spec, 'Unknown building.');
      requireRule(s.castle >= spec!.unlock, `Requires Castle level ${spec!.unlock}.`);
      requireRule(s.buildings[action.id] < s.castle, 'Upgrade your Castle to raise this building further.');
      const cost = buildingCost(action.id, s.buildings[action.id]);
      requireRule(s.gold >= cost, `You need ${cost - s.gold} more Gold.`);
      s.gold -= cost; s.buildings[action.id]++;
      break;
    }
    case 'start': {
      requireRule(!active(s), 'A battle is already in progress.');
      requireRule(BUILDINGS.some(b => s.buildings[b.id] > 0), 'Build a military building to unlock your first unit.');
      requireRule(Number.isInteger(action.stage) && action.stage > 0 && action.stage <= Math.min(CAMPAIGN.length, s.cleared + 1), 'Win the previous battle to unlock this front.');
      const enemyHp = 140 + (action.stage - 1) * 100;
      s.battle = { stage: action.stage, elapsed: 0, supply: 10, nextEnemy: 3, spawned: 0, playerSpawned: 0, nextId: 1,
        playerHp: castleHp(s.castle), playerMaxHp: castleHp(s.castle), enemyHp, enemyMaxHp: enemyHp, fighters: [], result: null };
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
    && integer(s.cleared, 0, CAMPAIGN.length) && !!s.tokens && TOPICS.every(t => integer(s.tokens[t], 0))
    && !!s.buildings && BUILDINGS.every(b => integer(s.buildings[b.id], 0, s.castle) && (s.buildings[b.id] === 0 || s.castle >= b.unlock))
    && Array.isArray(s.rewarded) && s.rewarded.every(id => typeof id === 'string'), 'Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.');
  if (s.battle !== null) {
    const b = s.battle;
    // Older battles predate automatic recruitment; keep their fighters and supply.
    if (b && b.playerSpawned === undefined) b.playerSpawned = 0;
    requireRule(!!b && integer(b.stage, 1, CAMPAIGN.length) && finite(b.elapsed, 0, 120)
      && finite(b.supply, 0, 20) && finite(b.playerMaxHp, 1, 10000) && finite(b.enemyMaxHp, 1, 10000)
      && finite(b.playerHp, 0, b.playerMaxHp) && finite(b.enemyHp, 0, b.enemyMaxHp)
      && finite(b.nextEnemy, 0, 130) && integer(b.spawned, 0, 100) && integer(b.playerSpawned, 0) && integer(b.nextId, 1)
      && [null, 'victory', 'defeat', 'draw'].includes(b.result) && Array.isArray(b.fighters) && b.fighters.length <= 100
      && b.fighters.every(f => BUILDINGS.some(spec => spec.id === f.kind) && ['player', 'enemy'].includes(f.side)
        && integer(f.id, 1) && finite(f.x, 0, 100) && finite(f.maxHp, 1, 10000) && finite(f.hp, 0, f.maxHp)
        && finite(f.damage, 1, 1000) && finite(f.range, 1, 100) && finite(f.speed, 1, 100)), 'Battle save could not be read. Your stored data has been preserved.');
  }
  return s;
}
