import { describe, it, expect } from 'vitest';
import {
  canonicalizeConceptName,
  findConcept,
  areAllPrerequisitesProficient,
  getEligibleConcepts,
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

  it('filters eligible concepts ready for practice (prerequisites met and not yet proficient)', () => {
    const eligible = getEligibleConcepts(sampleRegistry, 'Physics');
    // Wavefront is already proficient -> not eligible
    // Refractive index prerequisites met (Wavefront is proficient) and mastery is 'learning' -> eligible!
    // Snell's law prerequisites not all proficient -> not eligible
    expect(eligible.map((c) => c.canonicalName)).toEqual(['Refractive index']);
  });

  it('identifies when all concepts are proficient or empty', () => {
    expect(isAllConceptsProficientOrEmpty([])).toBe(true);
    expect(isAllConceptsProficientOrEmpty(sampleRegistry)).toBe(false);

    const allProficientRegistry: Concept[] = sampleRegistry.map((c) => ({
      ...c,
      mastery: 'proficient',
    }));
    expect(isAllConceptsProficientOrEmpty(allProficientRegistry)).toBe(true);
  });

  it('selects an eligible concept prioritizing older practice dates', () => {
    const concept = selectConceptForQuestion(sampleRegistry, 'Physics');
    expect(concept?.canonicalName).toBe('Refractive index');
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
});
