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
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

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
});
