import {
    REASONING_COMPLEXITIES,
    ReasoningTrack,
    MasteryLevel,
} from '../../types';

/**
 * Creates an empty reasoning track with 0 for all 7 complexities.
 */
export function createDefaultReasoningTrack(): ReasoningTrack {
    return {
        directInference: 0,
        composition: 0,
        discrimination: 0,
        transfer: 0,
        counterfactual: 0,
        synthesis: 0,
        derivation: 0,
    };
}

/**
 * Creates a fully mastered reasoning track with 3 for all 7 complexities.
 * Used for foundational atomic leaves which are assumed mastered.
 */
export function createMasteredReasoningTrack(): ReasoningTrack {
    return {
        directInference: 3,
        composition: 3,
        discrimination: 3,
        transfer: 3,
        counterfactual: 3,
        synthesis: 3,
        derivation: 3,
    };
}

/**
 * Ensures an atomic concept's reasoning track has at least 3 (mastered) in all complexities.
 */
export function getMasteredTrackForAtomic(track?: Partial<ReasoningTrack> | null): ReasoningTrack {
    const t = track || {};
    return {
        directInference: Math.max(t.directInference || 0, 3),
        composition: Math.max(t.composition || 0, 3),
        discrimination: Math.max(t.discrimination || 0, 3),
        transfer: Math.max(t.transfer || 0, 3),
        counterfactual: Math.max(t.counterfactual || 0, 3),
        synthesis: Math.max(t.synthesis || 0, 3),
        derivation: Math.max(t.derivation || 0, 3),
    };
}

/**
 * Mastery and reasoningTrack. Select the highest mastery that has its conditions covered:
 * - unseen - 0 in all complexities;
 * - learning - at least one in any of the complexity;
 * - proficient - at least one in each of directInference, composition, discrimination,
 *   at least 5 total of them. At least 3 in total of transfer, synthesis, and derivation;
 * - mastered - at least 3 in all reasoning categories, or atomic leaves assumed mastered.
 */
export function calculateMastery(
    track?: Partial<ReasoningTrack> | null,
    isAtomic?: boolean
): MasteryLevel {
    if (isAtomic) {
        return 'mastered';
    }

    if (!track) {
        return 'unseen';
    }

    const t: ReasoningTrack = {
        directInference: track.directInference || 0,
        composition: track.composition || 0,
        discrimination: track.discrimination || 0,
        transfer: track.transfer || 0,
        counterfactual: track.counterfactual || 0,
        synthesis: track.synthesis || 0,
        derivation: track.derivation || 0,
    };

    // 1. Check 'mastered': at least 3 in all reasoning categories
    const isMastered = REASONING_COMPLEXITIES.every((cat) => t[cat] >= 3);
    if (isMastered) {
        return 'mastered';
    }

    // 2. Check 'proficient':
    // - at least one in each of directInference, composition, discrimination
    // - at least 5 total of them (directInference + composition + discrimination >= 5)
    // - at least 3 in total of transfer, synthesis, and derivation (transfer + synthesis + derivation >= 3)
    const coreSum = t.directInference + t.composition + t.discrimination;
    const coreHasEach = t.directInference >= 1 && t.composition >= 1 && t.discrimination >= 1;
    const higherOrderSum = t.transfer + t.synthesis + t.derivation;

    if (coreHasEach && coreSum >= 5 && higherOrderSum >= 3) {
        return 'proficient';
    }

    // 3. Check 'learning': at least one in any of the complexity
    const hasAny = REASONING_COMPLEXITIES.some((cat) => t[cat] > 0);
    if (hasAny) {
        return 'learning';
    }

    // 4. 'unseen': 0 in all complexities
    return 'unseen';
}
