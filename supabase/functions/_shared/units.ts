import { LEGACY_UNITS, type UnitId as LegacyUnitId } from './legacyUnits.ts';
export type { AbilityFamily, AbilityDefinition, UnitProgress } from './legacyUnits.ts';
import type { AbilityDefinition } from './legacyUnits.ts';
export { initialUnitProgress } from './legacyUnits.ts';

export type UnitClass = 'melee' | 'ranged' | 'swarm' | 'healer' | 'siege';
export type UnitId = LegacyUnitId | 'militia' | 'royal-guard' | 'champion' | 'marksman' | 'horseman' | 'royal-knight'
  | 'hatchling' | 'forager' | 'stinger' | 'ravager' | 'hive-guard' | 'herbalist' | 'acolyte' | 'priest' | 'high-priest' | 'ballista' | 'trebuchet' | 'bombard' | 'great-bombard';
export interface UnitDefinition {
  id: UnitId; name: string; unitClass: UnitClass; tier: number;
  building: 'barracks' | 'range' | 'stable' | 'academy' | 'workshop';
  role: string; tags: readonly string[]; traits: readonly string[];
  hp: number; damage: number; healing: number; range: number; speed: number; spawnInterval: number; castleMultiplier: number;
  ability: AbilityDefinition;
  equipmentSlots: readonly { id: 'weapon' | 'armor' | 'artifact'; accepts: readonly string[] }[];
  badge: string; color: string; starter: boolean;
}

// Rows attack columns. Every tier uses this exact matrix, including splash hits.
export const CLASS_MATCHUPS: Record<UnitClass, Record<UnitClass, number>> = {
  melee:   { melee: 1, ranged: .75, swarm: 1.5, healer: 1, siege: 1 },
  ranged:  { melee: 1.5, ranged: 1, swarm: .75, healer: 1, siege: 1 },
  swarm: { melee: .75, ranged: 1.5, swarm: 1, healer: 1, siege: 1 },
  healer:  { melee: 0, ranged: 0, swarm: 0, healer: 0, siege: 0 },
  siege:   { melee: .75, ranged: .75, swarm: .75, healer: .75, siege: .75 },
};
export const UNIT_CLASSES = [
  { id: 'melee', name: 'Melee', building: 'barracks', description: '+50% damage to swarm; −25% to ranged.' },
  { id: 'ranged', name: 'Ranged', building: 'range', description: '+50% damage to melee; −25% to swarm.' },
  { id: 'swarm', name: 'Swarm', building: 'stable', description: 'Five creatures per deployment. Strong against single targets; vulnerable to siege splash.' },
  { id: 'healer', name: 'Healer', building: 'academy', description: 'Heals allies. Cannot attack, heal other healers or heal Keeps.' },
  { id: 'siege', name: 'Siege', building: 'workshop', description: 'Triple Keep damage; −25% damage to all unit classes. Splash hits up to five nearby enemies.' },
] as const;
const equipmentSlots: UnitDefinition['equipmentSlots'] = [
  { id: 'weapon', accepts: ['weapon'] }, { id: 'armor', accepts: ['armor'] }, { id: 'artifact', accepts: ['artifact'] },
];
const profiles: Record<UnitClass, { hp: number; damage: number; healing: number; range: number; speed: number; spawnInterval: number; castleMultiplier: number; tags: string[]; ability: AbilityDefinition; color: string }> = {
  melee: { hp: 65, damage: 12, healing: 0, range: 3, speed: 7, spawnInterval: 1.5, castleMultiplier: 1,
    tags: ['melee','heavy','armored','attacker','mobile'], color: '#93c5fd', ability: { family:'guard', interval:1, armor:.04, description:'Guard: +4 percentage points of armor. +50% damage to swarm; −25% to ranged.' } },
  ranged: { hp: 32, damage: 15, healing: 0, range: 18, speed: 6, spawnInterval: 2, castleMultiplier: 1,
    tags: ['ranged','attacker','mobile'], color: '#86efac', ability: { family:'guard', interval:1.25, armor:0, description:'Volley: +50% damage to melee; −25% to swarm.' } },
  swarm: { hp: 16, damage: 3.6, healing: 0, range: 3, speed: 8, spawnInterval: 3, castleMultiplier: 1,
    tags: ['swarm','attacker','mobile'], color: '#facc15', ability: { family:'guard', interval:1.25, armor:0, description:'Brood: five small creatures per deployment, sharing one capacity point. Overwhelms single targets; vulnerable to splash.' } },
  healer: { hp: 30, damage: 0, healing: 3, range: 14, speed: 6, spawnInterval: 4, castleMultiplier: 1,
    tags: ['healer','support','mobile'], color: '#6ee7b7', ability: { family:'heal', interval:1, description:'Mend: heals one injured ally with a finite lifetime budget. Cannot attack, resurrect, heal other healers or heal Keeps.' } },
  siege: { hp: 55, damage: 18, healing: 0, range: 25, speed: 3, spawnInterval: 4, castleMultiplier: 3,
    tags: ['siege','heavy','attacker'], color: '#fdba74', ability: { family:'splash', interval:3, radius:4, fraction:.35, targets:5, description:'Siege: triple Keep damage; −25% damage to all unit classes. 35% splash to five nearby enemies.' } },
};
const ladders: Record<UnitClass, readonly [UnitId, string, string][]> = {
  melee: [['militia','Militia','MI'],['spearman','Spearman','SP'],['swordsman','Swordsman','SW'],['royal-guard','Royal Guard','RG'],['champion','Champion','CH']],
  ranged: [['slinger','Slinger','SL'],['archer','Archer','AR'],['crossbowman','Crossbowman','CB'],['ranger','Ranger','RA'],['marksman','Marksman','MK']],
  swarm: [['hatchling','Hatchling','HA'],['forager','Forager','FO'],['stinger','Stinger','ST'],['ravager','Ravager','RV'],['hive-guard','Hive Guard','HG']],
  healer: [['medic','Medic','ME'],['herbalist','Herbalist','HE'],['acolyte','Acolyte','AC'],['priest','Priest','PR'],['high-priest','High Priest','HP']],
  siege: [['ballista','Ballista','BA'],['catapult','Catapult','CA'],['trebuchet','Trebuchet','TR'],['bombard','Bombard','BO'],['great-bombard','Great Bombard','GB']],
};
export const UNITS: readonly UnitDefinition[] = UNIT_CLASSES.flatMap(c => ladders[c.id].map(([id, name, badge], index) => {
  const tier = index + 1, power = 3 ** index, p = profiles[c.id];
  return { ...p, id, name, badge, unitClass:c.id, tier, building:c.building,
    hp:p.hp * power, damage:p.damage * power, healing:p.healing * power,
    role:'Tier ' + tier + ' ' + c.name.toLowerCase(), traits:[c.description], equipmentSlots,
    starter:index === 0 };
}));
export const unitDefinition = (id: UnitId) => UNITS.find(u => u.id === id)!;
export const classDamageMultiplier = (attacker: UnitId, target: UnitId) => CLASS_MATCHUPS[unitDefinition(attacker).unitClass][unitDefinition(target).unitClass];
// Legacy definitions are only used to finish already-frozen battles.
export const ALL_UNIT_IDENTITIES = [...LEGACY_UNITS.filter(old => !UNITS.some(u => u.id === old.id)), ...UNITS];
export const UNIT_TAGS = Object.fromEntries(ALL_UNIT_IDENTITIES.map(u => [u.id, u.tags])) as Record<UnitId, readonly string[]>;
