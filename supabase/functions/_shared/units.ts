import balance from './game-balance.json' with { type: 'json' };
export type UnitId = keyof typeof balance.unit.names;
export type AbilityFamily = 'basic' | 'counter' | 'charge' | 'heal' | 'execute' | 'pierce' | 'slow' | 'rally';
export interface AbilityDefinition {
    family: AbilityFamily;
    description: string;
    interval: number;
    targetTag?: string;
    multiplier?: number;
    every?: number;
    radius?: number;
    targets?: number;
    duration?: number;
    strength?: number;
}
export interface UnitProgress {
    level: number;
    stars: number;
    equipment: {
        weapon: null;
        armor: null;
        charm: null
    };
}
export const initialUnitProgress = (): UnitProgress => ({
    level: 1,
    stars: 1,
    equipment: {
        weapon: null,
        armor: null,
        charm: null
    }
});

export type UnitClass = 'melee' | 'ranged' | 'swarm' | 'healer' | 'siege';
export interface SplashAttack {
  radius: number;
  fraction: number;
}
interface UnitIdentity {
  id: UnitId;
  name: string;
  unitClass: UnitClass;
  tier: number;
  role: string;
  tags: readonly string[];
  traits: readonly string[];
  badge: string;
  color: string;
  starter: boolean;
}
interface UnitStats {
  hp: number;
  damage: number;
  splash: SplashAttack | null;
  healing: number;
  armor: number;
  range: number;
  speed: number;
  spawnInterval: number;
  castleMultiplier: number;
}
interface UnitEquipmentAndAbility {
  ability: AbilityDefinition;
  equipmentSlots: readonly {
      id: 'weapon' | 'armor' | 'artifact';
      accepts: readonly string[]
  }[];
}
export type UnitDefinition = UnitIdentity & UnitStats & UnitEquipmentAndAbility;

// Rows attack columns. Every tier uses this exact matrix, including splash hits.
export const CLASS_MATCHUPS: Record<UnitClass, Record<UnitClass, number>> = balance.battle.classMatchups;
export const UNIT_CLASSES = [
    {
        id: 'melee',
        name: 'Melee',
        description: `+${Math.round((CLASS_MATCHUPS.melee.swarm - 1) * 100)}% damage to swarm; ${Math.round((CLASS_MATCHUPS.melee.ranged - 1) * 100)}% to ranged.`
    },
    {
        id: 'ranged',
        name: 'Ranged',
        description: `+${Math.round((CLASS_MATCHUPS.ranged.melee - 1) * 100)}% damage to melee; ${Math.round((CLASS_MATCHUPS.ranged.swarm - 1) * 100)}% to swarm.`
    },
    {
        id: 'swarm',
        name: 'Swarm',
        description: `${balance.battle.swarmSize} creatures per deployment. Strong against single targets; vulnerable to siege splash.`
    },
    {
        id: 'healer',
        name: 'Healer',
        description: 'Heals allies. Cannot attack, heal other healers or heal Keeps.'
    },
    {
        id: 'siege',
        name: 'Siege',
        description: `${balance.unit.profiles.siege.castleMultiplier}× Keep damage; ${Math.round((CLASS_MATCHUPS.siege.melee - 1) * 100)}% damage to all unit classes. Splash hits every enemy within radius ${balance.unit.profiles.siege.splash.radius}.`
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
        abilityDescription: `Melee: +${Math.round((CLASS_MATCHUPS.melee.swarm - 1) * 100)}% damage to swarm; ${Math.round((CLASS_MATCHUPS.melee.ranged - 1) * 100)}% to ranged.`
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
        abilityDescription: `Siege: ${balance.unit.profiles.siege.castleMultiplier}× Keep damage; ${Math.round((CLASS_MATCHUPS.siege.melee - 1) * 100)}% damage to all unit classes. ${balance.unit.profiles.siege.splash.fraction * 100}% splash to every enemy within radius ${balance.unit.profiles.siege.splash.radius}.`
    }
} as const;
const ladders: Record<UnitClass, readonly [UnitId, string][]> = {
    melee: [['militia','MI'],['spearman','SP'],['swordsman','SW'],['royal-guard','RG'],['champion','CH']],
    ranged: [['slinger','SL'],['archer','AR'],['crossbowman','CB'],['ranger','RA'],['marksman','MK']],
    swarm: [['hatchling','HA'],['forager','FO'],['stinger','ST'],['ravager','RV'],['hive-guard','HG']],
    healer: [['medic','ME'],['herbalist','HE'],['acolyte','AC'],['priest','PR'],['high-priest','HP']],
    siege: [['ballista','BA'],['catapult','CA'],['trebuchet','TR'],['bombard','BO'],['great-bombard','GB']],
};
export const UNITS: readonly UnitDefinition[] = UNIT_CLASSES.flatMap(c => ladders[c.id].map(([id, badge], index) => {
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
        name: balance.unit.names[id],
        badge,
        unitClass:c.id,
        tier,
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
export const ALL_UNIT_IDENTITIES = UNITS;
export const UNIT_TAGS = Object.fromEntries(UNITS.map(u => [u.id, u.tags])) as Record<UnitId, readonly string[]>;
