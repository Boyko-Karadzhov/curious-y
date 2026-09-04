import { describe, it, expect } from 'vitest';
import {
  canonicalizeConceptName,
  findConcept,
  areAllPrerequisitesProficient,
  getEligibleConcepts,
  isAllConceptsMasteredOrEmpty,
  isAllConceptsProficientOrEmpty,
  selectConceptForQuestion,
} from '../lib/concepts/registry';
import { Concept } from '../types';
import { createDefaultReasoningTrack, createMasteredReasoningTrack } from '../lib/concepts/mastery';

describe('Concept Registry & Canonicalization', () => {
  const sampleRegistry: Concept[] = [
    {
      canonicalName: 'Wavefront',
      definition: 'A surface representing corresponding points of a wave that vibrate in unison.',
      aliases: ['wave fronts', 'wave surface'],
      topics: { Physics: 1.0 },
      prerequisites: [],
      mastery: 'proficient',
      reasoningTrack: createDefaultReasoningTrack(),
      lastAsked: '2026-09-01',
    },
    {
      canonicalName: 'Refractive index',
      definition: 'Dimensionless number that describes how fast light travels through the material.',
      aliases: ['index of refraction', 'optical index'],
      topics: { Physics: 1.0 },
      prerequisites: ['Wavefront'],
      mastery: 'learning',
      reasoningTrack: { ...createDefaultReasoningTrack(), directInference: 1 },
      lastAsked: '2026-09-02',
    },
    {
      canonicalName: "Snell's law",
      definition: 'Formula used to describe the relationship between the angles of incidence and refraction.',
      aliases: ["Snell's law of refraction", 'law of refraction'],
      topics: { Physics: 1.0 },
      prerequisites: ['Refractive index', 'Wavefront'],
      mastery: 'unseen',
      reasoningTrack: createDefaultReasoningTrack(),
    },
  ];

  it('finds concept by canonical name or alias (case-insensitive)', () => {
    expect(findConcept('Wavefront', sampleRegistry)?.canonicalName).toBe('Wavefront');
    expect(findConcept('wave surface', sampleRegistry)?.canonicalName).toBe('Wavefront');
    expect(findConcept('INDEX OF REFRACTION', sampleRegistry)?.canonicalName).toBe('Refractive index');
    expect(findConcept('Unknown Concept', sampleRegistry)).toBeUndefined();
  });

  it('canonicalizes names against the registry', () => {
    expect(canonicalizeConceptName('index of refraction', sampleRegistry)).toBe('Refractive index');
    expect(canonicalizeConceptName('law of refraction', sampleRegistry)).toBe("Snell's law");
    expect(canonicalizeConceptName('Non Existent Concept', sampleRegistry)).toBe('Non Existent Concept');
  });

  it('checks if all prerequisites are proficient or mastered', () => {
    // Wavefront has no prerequisites -> true
    expect(areAllPrerequisitesProficient(sampleRegistry[0], sampleRegistry)).toBe(true);

    // Refractive index has prerequisite 'Wavefront' (which is proficient) -> true
    expect(areAllPrerequisitesProficient(sampleRegistry[1], sampleRegistry)).toBe(true);

    // Snell's law has prerequisites 'Refractive index' (which is only learning) and 'Wavefront' -> false
    expect(areAllPrerequisitesProficient(sampleRegistry[2], sampleRegistry)).toBe(false);
  });

  it('filters eligible concepts ready for practice (prerequisites met and not yet mastered)', () => {
    const eligible = getEligibleConcepts(sampleRegistry, 'Physics');
    // Wavefront is proficient but not yet mastered (prerequisites met) -> eligible!
    // Refractive index prerequisites met (Wavefront is proficient) and mastery is 'learning' -> eligible!
    // Snell's law prerequisites not all proficient -> not eligible
    expect(eligible.map((c) => c.canonicalName)).toEqual(['Wavefront', 'Refractive index']);
  });

  it('identifies when all concepts are mastered or empty (proficient is not enough)', () => {
    expect(isAllConceptsMasteredOrEmpty([])).toBe(true);
    expect(isAllConceptsMasteredOrEmpty(sampleRegistry)).toBe(false);

    // If all concepts are only proficient, proficient is NOT enough -> false
    const allProficientRegistry: Concept[] = sampleRegistry.map((c) => ({
      ...c,
      mastery: 'proficient',
    }));
    expect(isAllConceptsMasteredOrEmpty(allProficientRegistry)).toBe(false);
    expect(isAllConceptsProficientOrEmpty(allProficientRegistry)).toBe(false);

    // When all concepts are truly mastered -> true
    const allMasteredRegistry: Concept[] = sampleRegistry.map((c) => ({
      ...c,
      mastery: 'mastered',
    }));
    expect(isAllConceptsMasteredOrEmpty(allMasteredRegistry)).toBe(true);
    expect(isAllConceptsProficientOrEmpty(allMasteredRegistry)).toBe(true);
  });

  it('selects an eligible concept prioritizing in-progress learning concepts', () => {
    const concept = selectConceptForQuestion(sampleRegistry, 'Physics');
    expect(concept?.canonicalName).toBe('Refractive index');
  });

  it('continues selecting proficient concepts until they are mastered when no learning concepts exist', () => {
    const proficientRegistry: Concept[] = [
      {
        canonicalName: 'Wavefront',
        definition: 'A surface representing corresponding points of a wave.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
    ];

    expect(getEligibleConcepts(proficientRegistry, 'Physics')).toHaveLength(1);
    expect(selectConceptForQuestion(proficientRegistry, 'Physics')?.canonicalName).toBe('Wavefront');
    expect(isAllConceptsMasteredOrEmpty(proficientRegistry)).toBe(false);

    // Once mastered:
    const masteredRegistry: Concept[] = [
      {
        ...proficientRegistry[0],
        mastery: 'mastered',
      },
    ];
    expect(getEligibleConcepts(masteredRegistry, 'Physics')).toHaveLength(0);
    expect(selectConceptForQuestion(masteredRegistry, 'Physics')).toBeNull();
    expect(isAllConceptsMasteredOrEmpty(masteredRegistry)).toBe(true);
  });

  describe('Atomic Leaves', () => {
    it('assumes atomic leaves are mastered and satisfy prerequisite checks', () => {
      const registryWithAtomic: Concept[] = [
        {
          canonicalName: 'Spatial distance',
          definition: 'Irreducible everyday intuition of separation.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'mastered',
          reasoningTrack: createMasteredReasoningTrack(),
        },
        {
          canonicalName: 'Velocity',
          definition: 'Rate of change of position.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: ['Spatial distance'],
          isAtomic: false,
          mastery: 'learning',
          reasoningTrack: createDefaultReasoningTrack(),
        },
      ];

      // Velocity prerequisite (Spatial distance) is atomic -> satisfied!
      expect(areAllPrerequisitesProficient(registryWithAtomic[1], registryWithAtomic)).toBe(true);

      // Only Velocity is eligible, Spatial distance is atomic and never questioned
      const eligible = getEligibleConcepts(registryWithAtomic, 'Physics');
      expect(eligible.map((c) => c.canonicalName)).toEqual(['Velocity']);

      const selected = selectConceptForQuestion(registryWithAtomic, 'Physics');
      expect(selected?.canonicalName).toBe('Velocity');
    });

    it('never questions atomic leaves even if mastery was not set to mastered', () => {
      const atomicOnlyRegistry: Concept[] = [
        {
          canonicalName: 'Counting',
          definition: 'Everyday intuition.',
          aliases: [],
          topics: { 'Mathematics & Logic': 1.0 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'unseen',
          reasoningTrack: createDefaultReasoningTrack(),
        },
      ];

      // Should never be eligible for questioning
      expect(getEligibleConcepts(atomicOnlyRegistry)).toEqual([]);
      expect(selectConceptForQuestion(atomicOnlyRegistry)).toBeNull();

      // Atomic leaves count as mastered/proficient for emptiness/boss question check
      expect(isAllConceptsProficientOrEmpty(atomicOnlyRegistry)).toBe(true);
    });
  });

  describe('Cross-Topic Prerequisite Resolution', () => {
    it('makes prerequisite concepts in other domains eligible when chosen topic concepts require them', () => {
      // Simulates the exact user scenario:
      // "Hubble's law" (Earth & Space) requires "Velocity" (Physics) and "Spatial distance" (Atomic).
      // "Cosmological recession velocity" (Earth & Space) requires "Hubble's law" and "Special relativity".
      const earthSpaceRegistry: Concept[] = [
        {
          canonicalName: 'Spatial distance',
          definition: 'Physical distance primitive.',
          aliases: [],
          topics: { 'Earth & Space': 0.5, 'Physics': 0.5 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'mastered',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Velocity',
          definition: 'Vector rate of change of position.',
          aliases: ['speed with direction'],
          topics: { 'Physics': 0.8, 'Mathematics & Logic': 0.2 }, // No Earth & Space!
          prerequisites: ['Spatial distance'],
          isAtomic: false,
          mastery: 'unseen',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Special relativity',
          definition: 'Invariance of speed of light in inertial frames.',
          aliases: [],
          topics: { 'Physics': 1.0 }, // No Earth & Space!
          prerequisites: ['Velocity'],
          isAtomic: false,
          mastery: 'unseen',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: "Hubble's law",
          definition: 'Recession velocity is proportional to distance.',
          aliases: [],
          topics: { 'Earth & Space': 0.8, 'Physics': 0.2 },
          prerequisites: ['Velocity', 'Spatial distance'],
          isAtomic: false,
          mastery: 'unseen',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Cosmological recession velocity',
          definition: 'Apparent speed at which distant astronomical objects move away.',
          aliases: [],
          topics: { 'Earth & Space': 0.9, 'Physics': 0.1 },
          prerequisites: ["Hubble's law", 'Special relativity'],
          isAtomic: false,
          mastery: 'unseen',
          reasoningTrack: createDefaultReasoningTrack(),
        },
      ];

      // When practicing "Earth & Space", neither "Hubble's law" nor "Cosmological recession velocity"
      // has its prerequisites met yet.
      // BUT "Velocity" is an essential prerequisite of "Hubble's law", and its prerequisite "Spatial distance" is mastered!
      // Therefore, "Velocity" MUST be eligible so the user can unlock "Earth & Space"!
      const eligible = getEligibleConcepts(earthSpaceRegistry, 'Earth & Space');
      expect(eligible.map((c) => c.canonicalName)).toEqual(['Velocity']);

      const selected = selectConceptForQuestion(earthSpaceRegistry, 'Earth & Space');
      expect(selected?.canonicalName).toBe('Velocity');

      // Now simulate user becoming proficient in Velocity:
      const updatedRegistry: Concept[] = earthSpaceRegistry.map((c) =>
        c.canonicalName === 'Velocity'
          ? { ...c, mastery: 'proficient' as const }
          : c
      );

      // Now "Hubble's law" (directly in Earth & Space) and "Special relativity" (prereq of Cosmological recession velocity)
      // are both ready. But "Hubble's law" is directly in Earth & Space, so it is prioritized!
      const nextEligible = getEligibleConcepts(updatedRegistry, 'Earth & Space');
      expect(nextEligible.map((c) => c.canonicalName)).toContain("Hubble's law");

      const nextSelected = selectConceptForQuestion(updatedRegistry, 'Earth & Space');
      expect(nextSelected?.canonicalName).toBe("Hubble's law");
    });
  });
});
