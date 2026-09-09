// Roster identity is independent of construction. Never rename shipped IDs.
export type UnitId = 'swordsman' | 'archer' | 'knight' | 'catapult' | 'medic' | 'spearman' | 'shieldbearer' | 'berserker' | 'duelist' | 'slinger' | 'crossbowman' | 'ranger' | 'clockwork-gunner' | 'scout-rider' | 'lancer' | 'ram' | 'bombardier' | 'frost-mage' | 'battle-sage' | 'astral-colossus';
export type AbilityFamily = 'guard' | 'counter' | 'charge' | 'splash' | 'heal' | 'execute' | 'pierce' | 'slow' | 'rally';
export interface AbilityDefinition {
  family: AbilityFamily; description: string; interval: number;
  targetTag?: string; multiplier?: number; armor?: number; every?: number;
  radius?: number; fraction?: number; targets?: number; duration?: number; strength?: number;
}
export interface UnitDefinition {
  id: UnitId; name: string; rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic';
  building: 'barracks' | 'range' | 'stable' | 'workshop' | 'academy';
  role: string; tags: readonly string[]; traits: readonly string[];
  hp: number; damage: number; range: number; speed: number; spawnInterval: number; castleMultiplier: number;
  ability: AbilityDefinition; unlock: { building: number; cleared: number; concepts: number };
  equipmentSlots: readonly { id: 'weapon' | 'armor' | 'charm'; accepts: readonly string[] }[];
  badge: string; color: string; starter: boolean;
}
export interface UnitProgress { level: number; stars: number; equipment: { weapon: null; armor: null; charm: null } }
export type UnitCollection = Partial<Record<UnitId, UnitProgress>>;
export const initialUnitProgress = (): UnitProgress => ({ level: 1, stars: 1, equipment: { weapon: null, armor: null, charm: null } });
const equipmentSlots: UnitDefinition['equipmentSlots'] = [
    { id: 'weapon', accepts: ['weapon'] }, { id: 'armor', accepts: ['armor'] }, { id: 'charm', accepts: ['charm'] },
];
function unit(id: UnitId, name: string, rarity: UnitDefinition['rarity'], building: UnitDefinition['building'],
    role: string, tags: string[], stats: number[], ability: AbilityDefinition, gate: number[], badge: string, color: string, starter = false): UnitDefinition {
    const [hp, damage, range, speed, spawnInterval, castleMultiplier = 1] = stats;
    return { id, name, rarity, building, role, tags, hp, damage, range, speed, spawnInterval, castleMultiplier, ability,
        unlock: { building: gate[0], cleared: gate[1] ?? 0, concepts: gate[2] ?? 0 },
        traits: [role, ability.description], equipmentSlots, badge, color, starter };
}

export const LEGACY_UNITS: readonly UnitDefinition[] = [
    unit('swordsman', 'Swordsman', 'Common', 'barracks', 'Steady frontline infantry', ['heavy','armored','attacker','mobile','infantry'], [65,12,3,7,1.5], { family:'guard', interval:1, armor:.04, description:'Guard: 4 percentage points of armor; dependable frequent recruits.' }, [1], 'SW', '#93c5fd', true),
    unit('archer', 'Archer', 'Common', 'range', 'Screens against light swarms', ['ranged','attacker','mobile'], [32,15,18,6,2], { family:'counter', interval:1.25, targetTag:'swarm', multiplier:1.6, description:'Volley: 60% more damage against swarm units.' }, [1], 'AR', '#86efac', true),
    unit('knight', 'Knight', 'Rare', 'stable', 'Fast, durable cavalry', ['heavy','armored','cavalry','attacker','mobile'], [140,20,3,10,3], { family:'charge', interval:1.25, multiplier:1.6, description:'Charge: first landed attack deals 60% more damage.' }, [1], 'KN', '#facc15', true),
    unit('catapult', 'Catapult', 'Rare', 'workshop', 'Long range siege; triple Keep damage', ['heavy','ranged','siege','attacker'], [55,18,25,3,4,3], { family:'splash', interval:3, radius:4, fraction:.35, targets:2, description:'Boulder: 35% splash to two neighbors; triple Keep damage. Workshop improves reload and radius.' }, [1], 'CA', '#fdba74', true),
    unit('medic', 'Medic', 'Common', 'academy', 'Sustains injured frontline allies', ['healer','support','ranged','mobile'], [30,0,14,6,4], { family:'heal', interval:1, description:'Mend: heals one injured non-healer; capped lifetime budget. Never heals Keeps or resurrects.' }, [1], 'ME', '#6ee7b7', true),
    unit('spearman', 'Spearman', 'Common', 'barracks', 'Affordable cavalry counter', ['infantry','attacker','mobile'], [60,14,5,6,1.75], { family:'counter', interval:1, targetTag:'cavalry', multiplier:2.5, description:'Brace: 150% more damage against cavalry, including rare Knights.' }, [1,1], 'SP', '#67e8f9'),
    unit('shieldbearer', 'Shieldbearer', 'Uncommon', 'barracks', 'Armored screen; low pressure', ['heavy','armored','infantry','attacker','mobile'], [105,7,3,4,2.5], { family:'guard', interval:1.5, armor:.28, description:'Bulwark: 28 percentage points of armor. Vulnerable to piercing and siege specialists.' }, [2,3], 'SH', '#a5b4fc'),
    unit('berserker', 'Berserker', 'Uncommon', 'barracks', 'Finishes damaged frontline', ['infantry','attacker','mobile'], [48,18,3,8,2], { family:'execute', interval:1, multiplier:1.8, description:'Frenzy: 80% more damage to targets below half health.' }, [2,5], 'BE', '#fca5a5'),
    unit('duelist', 'Duelist', 'Rare', 'barracks', 'Breaks elite armored units', ['infantry','attacker','mobile'], [58,16,3,8,2.5], { family:'pierce', interval:1, every:1, targets:0, description:'Lunge: every attack bypasses armor; no splash and modest health.' }, [3,10], 'DU', '#e9d5ff'),
    unit('slinger', 'Slinger', 'Common', 'range', 'Cheap swarm pressure', ['swarm','ranged','attacker','mobile'], [22,10,12,8,1], { family:'counter', interval:.75, targetTag:'siege', multiplier:1.8, description:'Harass: 80% more damage against siege. Cheap recruits are vulnerable to volleys and area damage.' }, [1,2], 'SL', '#fde68a'),
    unit('crossbowman', 'Crossbowman', 'Uncommon', 'range', 'Hunts heavy targets from range', ['ranged','attacker','mobile'], [30,17,17,5,2.5], { family:'counter', interval:2, targetTag:'heavy', multiplier:1.9, description:'Heavy bolt: 90% more damage against heavy units, including the Astral Colossus.' }, [2,4], 'CB', '#d9f99d'),
    unit('ranger', 'Ranger', 'Uncommon', 'range', 'Outranges ranged formations', ['ranged','attacker','mobile'], [28,14,24,7,2.75], { family:'counter', interval:1.5, targetTag:'ranged', multiplier:1.6, description:'Snipe: 60% more damage against ranged units; low health against cavalry.' }, [2,7], 'RA', '#34d399'),
    unit('clockwork-gunner', 'Clockwork Gunner', 'Rare', 'workshop', 'Sustained piercing fire', ['ranged','attacker','mobile'], [42,16,19,5,3], { family:'pierce', interval:.75, every:5, targets:2, radius:9, description:'Fifth shot: bypasses armor and pierces up to two enemies behind the target within 9 reach. Counter persists across reload.' }, [2,8], 'CG', '#fcd34d'),
    unit('scout-rider', 'Scout Rider', 'Common', 'stable', 'Fragile cavalry that pressures supports', ['cavalry','swarm','attacker','mobile'], [45,12,4,13,1.75], { family:'counter', interval:.75, targetTag:'support', multiplier:2, description:'Raid: prioritizes supports in reach and deals double damage to them.' }, [1,3], 'SC', '#fdba74'),
    unit('lancer', 'Lancer', 'Uncommon', 'stable', 'Burst cavalry; slow reinforcements', ['cavalry','heavy','attacker','mobile'], [85,19,5,11,3.5], { family:'charge', interval:1.5, multiplier:3, description:'Couched lance: first landed attack deals triple damage. Spearmen punish its cavalry tag.' }, [2,6], 'LA', '#f9a8d4'),
    unit('ram', 'Battering Ram', 'Uncommon', 'workshop', 'Armored short-range siege', ['heavy','armored','siege','attacker'], [150,10,3,4,4,5], { family:'guard', interval:2.5, armor:.2, description:'Covered ram: 20 percentage points of armor; fivefold Keep damage, weak against infantry.' }, [1,5], 'RM', '#d6d3d1'),
    unit('bombardier', 'Bombardier', 'Uncommon', 'workshop', 'Fragile anti-swarm artillery', ['ranged','siege','attacker'], [28,17,16,5,3.25,1.5], { family:'splash', interval:2, radius:7, fraction:.5, targets:3, description:'Cluster bomb: 50% splash to three nearby enemies; short range exposes fragile crews.' }, [2,9], 'BO', '#fb923c'),
    unit('frost-mage', 'Frost Mage', 'Rare', 'academy', 'Slows fast advances', ['ranged','support','attacker','mobile'], [30,10,18,6,3.25], { family:'slow', interval:1.5, strength:.3, duration:2, description:'Frost: reduces target movement 30% for 2 seconds; refreshes without stacking. Does not freeze attacks.' }, [2,5,3], 'FR', '#a5f3fc'),
    unit('battle-sage', 'Battle Sage', 'Rare', 'academy', 'Supports concentrated formations', ['ranged','support','attacker','mobile'], [40,8,14,5,4], { family:'rally', interval:2, strength:.15, duration:2.5, radius:10, targets:3, description:'Rally: attacks grant three nearby non-support allies +15% damage for 2.5s; no stacking or recursive buffs.' }, [3,10,10], 'BS', '#c4b5fd'),
    unit('astral-colossus', 'Astral Colossus', 'Epic', 'academy', 'Slow durable area specialist', ['heavy','armored','attacker'], [220,24,7,3,6], { family:'splash', interval:3, radius:8, fraction:.5, targets:4, description:'Starfall: 50% area damage to four neighbors. Slow 18s recruitment and movement leave it vulnerable to heavy-target counters.' }, [3,15,15], 'AC', '#d8b4fe'),
];
export const legacyUnitDefinition = (id: string) => LEGACY_UNITS.find(u => u.id === id)!;
export const LEGACY_TAGS = Object.fromEntries(LEGACY_UNITS.map(u => [u.id, u.tags]));
