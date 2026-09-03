import {
  ReasoningComplexity,
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
 * Mastery and reasoningTrack. Select the highest mastery that has its conditions covered:
 * - unseen - 0 in all complexities;
 * - learning - at least one in any of the complexity;
 * - proficient - at least one in each of directInference, composition, discrimination,
 *   at least 5 total of them. At least 3 in total of transfer, synthesis, and derivation;
 * - mastered - at least 3 in all reasoning categories.
 */
export function calculateMastery(track?: Partial<ReasoningTrack> | null): MasteryLevel {
  if (!track) return 'unseen';

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
  const advancedSum = t.transfer + t.synthesis + t.derivation;

  if (coreHasEach && coreSum >= 5 && advancedSum >= 3) {
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

/**
 * Calculates sampling weights for reasoning complexities for a concept.
 * Reasoning complexity leans towards those that have been used less for the concept
 * (known from the reasoningTrack) and if all equal - lean towards less complex.
 */
export function getReasoningComplexityWeights(
  track?: Partial<ReasoningTrack> | null
): Record<ReasoningComplexity, number> {
  const t = track || {};
  const weights = {} as Record<ReasoningComplexity, number>;

  REASONING_COMPLEXITIES.forEach((cat, index) => {
    // Simpler categories get higher base priority: directInference (index 0) gets 7, derivation (index 6) gets 1
    const basePriority = REASONING_COMPLEXITIES.length - index;
    const count = t[cat] || 0;
    // Lower count gets quadratically higher weight
    weights[cat] = basePriority / Math.pow(count + 1, 2);
  });

  return weights;
}

/**
 * Biased selection for reasoning complexity.
 * Leans towards those that have been used less for the concept, and if equal,
 * leans towards less complex.
 *
 * @param track Current reasoningTrack of the concept
 * @param rng Optional random number generator (returns [0, 1)) for test reproducibility
 */
export function selectReasoningComplexity(
  track?: Partial<ReasoningTrack> | null,
  rng: () => number = Math.random
): ReasoningComplexity {
  const weights = getReasoningComplexityWeights(track);
  let totalWeight = 0;

  for (const cat of REASONING_COMPLEXITIES) {
    totalWeight += weights[cat];
  }

  const threshold = rng() * totalWeight;
  let cumulative = 0;

  for (const cat of REASONING_COMPLEXITIES) {
    cumulative += weights[cat];
    if (threshold <= cumulative) {
      return cat;
    }
  }

  return REASONING_COMPLEXITIES[0];
}
