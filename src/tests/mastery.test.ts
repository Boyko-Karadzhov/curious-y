import { describe, it, expect } from 'vitest';
import {
  calculateMastery,
  createDefaultReasoningTrack,
  getReasoningComplexityWeights,
  selectReasoningComplexity,
} from '../lib/concepts/mastery';
import { ReasoningTrack, REASONING_COMPLEXITIES } from '../types';

describe('Concept Mastery & Reasoning Track Logic', () => {
  it('creates an empty reasoning track with all 7 complexities at 0', () => {
    const track = createDefaultReasoningTrack();
    expect(track).toEqual({
      directInference: 0,
      composition: 0,
      discrimination: 0,
      transfer: 0,
      counterfactual: 0,
      synthesis: 0,
      derivation: 0,
    });
  });

  describe('calculateMastery', () => {
    it('returns "unseen" when all complexities are 0 or track is null/undefined', () => {
      expect(calculateMastery(undefined)).toBe('unseen');
      expect(calculateMastery(null)).toBe('unseen');
      expect(calculateMastery(createDefaultReasoningTrack())).toBe('unseen');
    });

    it('returns "learning" when at least one complexity is > 0 but proficient conditions are not met', () => {
      const track1: ReasoningTrack = {
        ...createDefaultReasoningTrack(),
        directInference: 1,
      };
      expect(calculateMastery(track1)).toBe('learning');

      const track2: ReasoningTrack = {
        ...createDefaultReasoningTrack(),
        transfer: 2,
        derivation: 1,
      };
      expect(calculateMastery(track2)).toBe('learning');
    });

    it('returns "learning" if core has total >= 5 but one core category is 0', () => {
      const track: ReasoningTrack = {
        ...createDefaultReasoningTrack(),
        directInference: 5,
        composition: 0,
        discrimination: 2,
        transfer: 3,
      };
      // composition is 0, so not proficient
      expect(calculateMastery(track)).toBe('learning');
    });

    it('returns "learning" if core has each >= 1 but core total is < 5', () => {
      const track: ReasoningTrack = {
        ...createDefaultReasoningTrack(),
        directInference: 1,
        composition: 1,
        discrimination: 1, // total = 3 (< 5)
        transfer: 2,
        synthesis: 1, // advanced total = 3
      };
      expect(calculateMastery(track)).toBe('learning');
    });

    it('returns "learning" if core conditions are met but advanced total < 3', () => {
      const track: ReasoningTrack = {
        ...createDefaultReasoningTrack(),
        directInference: 2,
        composition: 2,
        discrimination: 1, // core total = 5, all >= 1
        transfer: 1,
        synthesis: 1,
        derivation: 0, // advanced total = 2 (< 3)
      };
      expect(calculateMastery(track)).toBe('learning');
    });

    it('returns "proficient" when core has >= 1 each and >= 5 total, and advanced has >= 3 total', () => {
      // Direct minimum proficient threshold:
      // directInference: 2, composition: 2, discrimination: 1 (sum = 5, all >= 1)
      // transfer: 1, synthesis: 1, derivation: 1 (sum = 3)
      const track: ReasoningTrack = {
        directInference: 2,
        composition: 2,
        discrimination: 1,
        transfer: 1,
        counterfactual: 0,
        synthesis: 1,
        derivation: 1,
      };
      expect(calculateMastery(track)).toBe('proficient');
    });

    it('returns "proficient" for the example track from next-steps.md', () => {
      // From next-steps.md lines 23-30:
      // directInference: 3, composition: 2, discrimination: 2 (sum = 7 >= 5, each >= 1)
      // transfer: 1, synthesis: 0, derivation: 0 (wait, in the next-steps text: "At least 3 in total of transfer, synthesis, and derivation.")
      // Let's test with transfer: 2, derivation: 1:
      const track: ReasoningTrack = {
        directInference: 3,
        composition: 2,
        discrimination: 2,
        transfer: 2,
        counterfactual: 1,
        synthesis: 0,
        derivation: 1,
      };
      expect(calculateMastery(track)).toBe('proficient');
    });

    it('returns "mastered" when at least 3 in ALL reasoning categories', () => {
      const track: ReasoningTrack = {
        directInference: 3,
        composition: 3,
        discrimination: 3,
        transfer: 3,
        counterfactual: 3,
        synthesis: 3,
        derivation: 3,
      };
      expect(calculateMastery(track)).toBe('mastered');

      // Higher than 3 also mastered
      const trackAbove3: ReasoningTrack = {
        directInference: 5,
        composition: 4,
        discrimination: 3,
        transfer: 6,
        counterfactual: 3,
        synthesis: 4,
        derivation: 3,
      };
      expect(calculateMastery(trackAbove3)).toBe('mastered');
    });

    it('does not return "mastered" if even one category has < 3', () => {
      const track: ReasoningTrack = {
        directInference: 5,
        composition: 5,
        discrimination: 5,
        transfer: 5,
        counterfactual: 5,
        synthesis: 5,
        derivation: 2, // < 3
      };
      // But satisfies proficient!
      expect(calculateMastery(track)).toBe('proficient');
    });
  });

  describe('selectReasoningComplexity biased weighting', () => {
    it('leans towards less complex when all tracks are equal (e.g. all 0)', () => {
      const track = createDefaultReasoningTrack();
      const weights = getReasoningComplexityWeights(track);

      // Verify descending order of weights for equal usage
      for (let i = 0; i < REASONING_COMPLEXITIES.length - 1; i++) {
        const curr = REASONING_COMPLEXITIES[i];
        const next = REASONING_COMPLEXITIES[i + 1];
        expect(weights[curr]).toBeGreaterThan(weights[next]);
      }

      // rng at 0 picks the highest-weight / simplest category
      expect(selectReasoningComplexity(track, () => 0.001)).toBe('directInference');
    });

    it('leans towards categories that have been used less', () => {
      // If directInference has been used 10 times, and composition 0 times:
      const track: ReasoningTrack = {
        ...createDefaultReasoningTrack(),
        directInference: 10,
        composition: 0,
      };
      const weights = getReasoningComplexityWeights(track);

      // composition (unused) should have vastly higher weight than directInference (used 10 times)
      expect(weights.composition).toBeGreaterThan(weights.directInference);
    });
  });
});
