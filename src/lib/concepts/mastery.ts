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
 * Returns eligible reasoning complexities for a given mastery level:
 * - unseen: only directInference
 * - learning: directInference, composition, discrimination
 * - proficient / mastered: any reasoning complexity
 */
export function getEligibleComplexitiesForMastery(
  mastery: MasteryLevel
): readonly ReasoningComplexity[] {
  switch (mastery) {
    case 'unseen':
      return ['directInference'] as const;
    case 'learning':
      return ['directInference', 'composition', 'discrimination'] as const;
    case 'proficient':
    case 'mastered':
    default:
      return REASONING_COMPLEXITIES;
  }
}

/**
 * Calculates raw base weights for all 7 reasoning complexities without mastery gating.
 */
export function getRawReasoningComplexityWeights(
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
 * Calculates sampling weights for reasoning complexities for a concept taking
 * into account the concept's mastery level:
 * - "unseen": only directInference
 * - "learning": directInference, composition, discrimination
 * - "proficient" / "mastered": any reasoning complexity
 *
 * Within the eligible pool, weights lean towards less-used complexities,
 * and if equal, lean towards less complex.
 */
export function getReasoningComplexityWeights(
  track?: Partial<ReasoningTrack> | null,
  mastery?: MasteryLevel
): Record<ReasoningComplexity, number> {
  const effectiveMastery = mastery !== undefined ? mastery : calculateMastery(track);
  const eligible = new Set(getEligibleComplexitiesForMastery(effectiveMastery));
  const rawWeights = getRawReasoningComplexityWeights(track);
  const weights = {} as Record<ReasoningComplexity, number>;

  for (const cat of REASONING_COMPLEXITIES) {
    weights[cat] = eligible.has(cat) ? rawWeights[cat] : 0;
  }

  return weights;
}

/**
 * Biased selection for reasoning complexity based on mastery level:
 * - While in "unseen" mastery: only able to get directInference.
 * - While in "learning" mastery: directInference, composition, discrimination.
 * - Once proficient or more: can get any reasoning complexity.
 *
 * Within the eligible pool, leans towards those that have been used less for the concept,
 * and if equal, leans towards less complex.
 *
 * @param track Current reasoningTrack of the concept
 * @param masteryOrRng Optional mastery level or RNG function
 * @param maybeRng Optional RNG function if mastery level was passed
 */
export function selectReasoningComplexity(
  track?: Partial<ReasoningTrack> | null,
  masteryOrRng?: MasteryLevel | (() => number),
  maybeRng?: () => number
): ReasoningComplexity {
  let mastery: MasteryLevel | undefined = undefined;
  let rng: () => number = Math.random;

  if (typeof masteryOrRng === 'function') {
    rng = masteryOrRng;
  } else if (typeof masteryOrRng === 'string') {
    mastery = masteryOrRng;
    if (maybeRng) {
      rng = maybeRng;
    }
  }

  const effectiveMastery = mastery !== undefined ? mastery : calculateMastery(track);
  const eligible = getEligibleComplexitiesForMastery(effectiveMastery);

  if (eligible.length === 1) {
    return eligible[0];
  }

  const weights = getReasoningComplexityWeights(track, effectiveMastery);
  let totalWeight = 0;

  for (const cat of eligible) {
    totalWeight += weights[cat];
  }

  if (totalWeight <= 0) {
    return eligible[0];
  }

  const threshold = rng() * totalWeight;
  let cumulative = 0;

  for (const cat of eligible) {
    cumulative += weights[cat];
    if (threshold <= cumulative) {
      return cat;
    }
  }

  return eligible[0];
}
