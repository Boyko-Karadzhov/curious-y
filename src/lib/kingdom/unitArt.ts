import { UnitId, ALL_UNIT_IDENTITIES } from './game';
import { isSwarmArt, swarmIdleHeight } from './swarmArt';

export interface UnitArt {
  source: string;
  portrait: string;
  displayHeight: number;
  idleHeight: number;
  atlas: {
      src: string;
      columns: number;
      rows: number;
      frameSize: number;
      anchorX: number;
      anchorY: number
  };
}

// Presentation belongs here, outside combat/save definitions. Every surface
// resolves a unit through this registry, and portraits come from approved poses.
// Measured first-idle silhouettes in the normalized atlas. Weapon reach can
// force smaller drawings inside a cell; it must not shrink the unit in game.
const idleHeights: Record<string, number> = {
    swordsman: 179,
    archer: 212,
    medic: 106,
    spearman: 91,
    'royal-guard': 166,
    militia: 160,
    champion: 88,
    slinger: 196,
    crossbowman: 112,
    ranger: 182,
    'marksman': 125,
    catapult: 130,
    bombard: 154,
    'acolyte': 125,
    'priest': 123,
};
// Reuse the established painted sprite library for the new roster identities.
const sources: Partial<Record<UnitId, string>> = {
    herbalist:'medic',
    'high-priest':'priest',
    ballista:'catapult',
    trebuchet:'catapult',
    'great-bombard':'bombard',
};
const generated = Object.fromEntries(ALL_UNIT_IDENTITIES.map(({ id }) => {
    const source = sources[id] ?? id;
    return [id, {
        source,
        portrait: `/assets/units/${source}-${isSwarmArt(id) ? 'v2' : 'v1'}/portrait.png`,
        idleHeight: isSwarmArt(id) ? swarmIdleHeight(id) : idleHeights[source],
        displayHeight: isSwarmArt(id) ? 34 : 64,
        atlas: {
            src: `/assets/units/${source}-${isSwarmArt(id) ? 'v2' : 'v1'}/atlas.png`,
            columns: 4,
            rows: 3,
            frameSize: 256,
            anchorX: source === 'swordsman' ? 112 / 256 : .5,
            anchorY: 232 / 256
        },
    }];
})) as Record<UnitId, UnitArt>;

export function unitArt(id: UnitId): UnitArt {
    return generated[id];
}

export function unitArtFrame(id: UnitId, pose: 'idle' | 'walk' | 'attack', seconds: number, attackSeconds: number, reducedMotion = false) {
    const atlas = unitArt(id).atlas;
    if (reducedMotion) {
        return {
            row: 0,
            column: 0
        };
    }

    const duration = pose === 'attack' ? attackSeconds : pose === 'walk' ? .8 : 1.2;
    return {
        row: pose === 'attack' ? 2 : pose === 'walk' ? 1 : 0,
        column: Math.floor(((Math.max(0, seconds) % duration) / duration) * atlas.columns)
    };
}
