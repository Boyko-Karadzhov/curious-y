import { LEGACY_UNITS, type UnitId as LegacyUnitId } from './legacyUnits.ts';
import balance from './game-balance.json' with { type: 'json' };
export type { AbilityFamily, AbilityDefinition, UnitProgress } from './legacyUnits.ts';
import type { AbilityDefinition } from './legacyUnits.ts';
export { initialUnitProgress } from './legacyUnits.ts';

export type UnitClass = 'melee' | 'ranged' | 'swarm' | 'healer' | 'siege';
export type UnitId = LegacyUnitId | 'militia' | 'royal-guard' | 'champion' | 'marksman' | 'horseman' | 'royal-knight'
  | 'hatchling' | 'forager' | 'stinger' | 'ravager' | 'hive-guard' | 'herbalist' | 'acolyte' | 'priest' | 'high-priest' | 'ballista' | 'trebuchet' | 'bombard' | 'great-bombard';
export interface UnitDefinition {
  id: UnitId;
  name: string;
  unitClass: UnitClass;
  tier: number;
  building: 'barracks' | 'range' | 'stable' | 'academy' | 'workshop';
  role: string;
  tags: readonly string[];
  traits: readonly string[];
  hp: number;
  damage: number;
  healing: number;
  range: number;
  speed: number;
  spawnInterval: number;
  castleMultiplier: number;
  ability: AbilityDefinition;
  equipmentSlots: readonly {
      id: 'weapon' | 'armor' | 'artifact';
      accepts: readonly string[]
  }[];
  badge: string;
  color: string;
  starter: boolean;
}

// Rows attack columns. Every tier uses this exact matrix, including splash hits.
export const CLASS_MATCHUPS: Record<UnitClass, Record<UnitClass, number>> = balance.battle.classMatchups;
export const UNIT_CLASSES = [
    {
        id: 'melee',
        name: 'Melee',
        building: 'barracks',
        description: `+${Math.round((CLASS_MATCHUPS.melee.swarm - 1) * 100)}% damage to swarm; ${Math.round((CLASS_MATCHUPS.melee.ranged - 1) * 100)}% to ranged.`
    },
    {
        id: 'ranged',
        name: 'Ranged',
        building: 'range',
        description: `+${Math.round((CLASS_MATCHUPS.ranged.melee - 1) * 100)}% damage to melee; ${Math.round((CLASS_MATCHUPS.ranged.swarm - 1) * 100)}% to swarm.`
    },
    {
        id: 'swarm',
        name: 'Swarm',
        building: 'stable',
        description: `${balance.battle.swarmSize} creatures per deployment. Strong against single targets; vulnerable to siege splash.`
    },
    {
        id: 'healer',
        name: 'Healer',
        building: 'academy',
        description: 'Heals allies. Cannot attack, heal other healers or heal Keeps.'
    },
    {
        id: 'siege',
        name: 'Siege',
        building: 'workshop',
        description: `${balance.unit.profiles.siege.castleMultiplier}× Keep damage; ${Math.round((CLASS_MATCHUPS.siege.melee - 1) * 100)}% damage to all unit classes. Splash hits up to ${balance.unit.profiles.siege.ability.targets} nearby enemies.`
    },
] as const;
const equipmentSlots: UnitDefinition['equipmentSlots'] = [
    {
        id: 'weapon',
        accepts: ['weapon']
    }, {
        id: 'armor',
        accepts: ['armor']
    }, {
        id: 'artifact',
        accepts: ['artifact']
    },
];
const profileDetails = {
    melee: {
        tags: ['melee','heavy','armored','attacker','mobile'],
        color: '#93c5fd',
        abilityDescription: `Guard: +${balance.unit.profiles.melee.ability.armor * 100} percentage points of armor. +${Math.round((CLASS_MATCHUPS.melee.swarm - 1) * 100)}% damage to swarm; ${Math.round((CLASS_MATCHUPS.melee.ranged - 1) * 100)}% to ranged.`
    },
    ranged: {
        tags: ['ranged','attacker','mobile'],
        color: '#86efac',
        abilityDescription: `Volley: +${Math.round((CLASS_MATCHUPS.ranged.melee - 1) * 100)}% damage to melee; ${Math.round((CLASS_MATCHUPS.ranged.swarm - 1) * 100)}% to swarm.`
    },
    swarm: {
        tags: ['swarm','attacker','mobile'],
        color: '#facc15',
        abilityDescription: `Brood: ${balance.battle.swarmSize} small creatures per deployment, sharing one capacity point. Overwhelms single targets; vulnerable to splash.`
    },
    healer: {
        tags: ['healer','support','mobile'],
        color: '#6ee7b7',
        abilityDescription: 'Mend: heals one injured ally with a finite lifetime budget. Cannot attack, resurrect, heal other healers or heal Keeps.'
    },
    siege: {
        tags: ['siege','heavy','attacker'],
        color: '#fdba74',
        abilityDescription: `Siege: ${balance.unit.profiles.siege.castleMultiplier}× Keep damage; ${Math.round((CLASS_MATCHUPS.siege.melee - 1) * 100)}% damage to all unit classes. ${balance.unit.profiles.siege.ability.fraction * 100}% splash to ${balance.unit.profiles.siege.ability.targets} nearby enemies.`
    }
} as const;
const ladders: Record<UnitClass, readonly [UnitId, string, string][]> = {
    melee: [['militia','Militia','MI'],['spearman','Spearman','SP'],['swordsman','Swordsman','SW'],['royal-guard','Royal Guard','RG'],['champion','Champion','CH']],
    ranged: [['slinger','Slinger','SL'],['archer','Archer','AR'],['crossbowman','Crossbowman','CB'],['ranger','Ranger','RA'],['marksman','Marksman','MK']],
    swarm: [['hatchling','Hatchling','HA'],['forager','Forager','FO'],['stinger','Stinger','ST'],['ravager','Ravager','RV'],['hive-guard','Hive Guard','HG']],
    healer: [['medic','Medic','ME'],['herbalist','Herbalist','HE'],['acolyte','Acolyte','AC'],['priest','Priest','PR'],['high-priest','High Priest','HP']],
    siege: [['ballista','Ballista','BA'],['catapult','Catapult','CA'],['trebuchet','Trebuchet','TR'],['bombard','Bombard','BO'],['great-bombard','Great Bombard','GB']],
};
export const UNITS: readonly UnitDefinition[] = UNIT_CLASSES.flatMap(c => ladders[c.id].map(([id, name, badge], index) => {
    const tier = index + 1, power = balance.unit.tierMultiplier ** index, p = balance.unit.profiles[c.id];
    const { abilityDescription, ...details } = profileDetails[c.id];
    return {
        ...p,
        ...details,
        ability: {
            ...p.ability,
            description: abilityDescription
        } as AbilityDefinition,
        id,
        name,
        badge,
        unitClass:c.id,
        tier,
        building:c.building,
        hp:p.hp * power,
        damage:p.damage * power,
        healing:p.healing * power,
        role:'Tier ' + tier + ' ' + c.name.toLowerCase(),
        traits:[c.description],
        equipmentSlots,
        starter:index === 0
    };
}));
export const unitDefinition = (id: UnitId) => UNITS.find(u => u.id === id)!;
export const classDamageMultiplier = (attacker: UnitId, target: UnitId) => CLASS_MATCHUPS[unitDefinition(attacker).unitClass][unitDefinition(target).unitClass];
// Legacy definitions are only used to finish already-frozen battles.
export const ALL_UNIT_IDENTITIES = [...LEGACY_UNITS.filter(old => !UNITS.some(u => u.id === old.id)), ...UNITS];
export const UNIT_TAGS = Object.fromEntries(ALL_UNIT_IDENTITIES.map(u => [u.id, u.tags])) as Record<UnitId, readonly string[]>;
