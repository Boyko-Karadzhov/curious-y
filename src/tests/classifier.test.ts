import { describe, it, expect } from 'vitest';
import {
  inferConceptTopics,
  normalizeConceptTopics,
  mergeConceptTopics,
  reclassifyConcept,
  reclassifyConcepts,
  isKnownMisclassification,
  roundAndNormalizeWeights,
  matchCanonicalTopic,
} from '../lib/concepts/classifier';
import { Concept } from '../types';
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

describe('Concept Topic Classifier & Ontology', () => {
  describe('Ontology & Specific Concepts Classification', () => {
    it('classifies "Velocity" primarily into Physics with secondary in Mathematics & Logic', () => {
      const topics = inferConceptTopics('Velocity', 'Vector measurement of the rate and direction of motion.');
      expect(topics['Physics']).toBe(0.8);
      expect(topics['Mathematics & Logic']).toBe(0.2);
      expect(Object.keys(topics)).not.toContain('Earth & Space');
    });

    it('classifies "Fluid dynamics" primarily into Physics with secondary in Earth & Space', () => {
      const topics = inferConceptTopics('Fluid dynamics', 'The study of the flow of liquids and gases.');
      expect(topics['Physics']).toBe(0.8);
      expect(topics['Earth & Space']).toBe(0.2);
    });

    it('classifies "Electric charge" primarily into Physics with secondary in Chemistry', () => {
      const topics = inferConceptTopics('Electric charge', 'Physical property of matter that causes it to experience a force in an electromagnetic field.');
      expect(topics['Physics']).toBe(0.7);
      expect(topics['Chemistry']).toBe(0.3);
    });

    it('classifies "Electromagnetic radiation" primarily into Physics with secondary in Chemistry', () => {
      const topics = inferConceptTopics('Electromagnetic radiation', 'Waves of electromagnetic field propagating through space carrying radiant energy.');
      expect(topics['Physics']).toBe(0.7);
      expect(topics['Chemistry']).toBe(0.3);
    });

    it('classifies other foundational concepts accurately', () => {
      const dna = inferConceptTopics('DNA', 'Deoxyribonucleic acid');
      expect(dna['Life']).toBe(0.8);
      expect(dna['Chemistry']).toBe(0.2);

      const plateTectonics = inferConceptTopics('Plate tectonics', 'Motion of Earth lithospheric plates');
      expect(plateTectonics['Earth & Space']).toBe(0.8);
      expect(plateTectonics['Physics']).toBe(0.2);

      const derivative = inferConceptTopics('Derivative', 'Rate of change');
      expect(derivative['Mathematics & Logic']).toBe(0.8);
      expect(derivative['Physics']).toBe(0.2);
    });
  });

  describe('Topic Normalization', () => {
    it('normalizes array format from JSON Schema to Record<string, number>', () => {
      const raw = [
        { topic: 'Physics', weight: 0.7 },
        { topic: 'Chemistry', weight: 0.3 },
      ];
      const normalized = normalizeConceptTopics(raw, 'Some Concept');
      expect(normalized['Physics']).toBe(0.7);
      expect(normalized['Chemistry']).toBe(0.3);
    });

    it('normalizes weights so they sum to 1.0', () => {
      const raw = [
        { topic: 'Physics', weight: 3 },
        { topic: 'Chemistry', weight: 1 },
      ];
      const normalized = normalizeConceptTopics(raw, 'Unknown Concept');
      const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 100) / 100).toBe(1.0);
      expect(normalized['Physics']).toBe(0.75);
      expect(normalized['Chemistry']).toBe(0.25);
    });

    it('corrects known misclassifications when normalizing', () => {
      // Velocity mistakenly tagged with Earth & Space
      const badVelocity = { 'Earth & Space': 1.0 };
      const corrected = normalizeConceptTopics(badVelocity, 'Velocity');
      expect(corrected['Physics']).toBe(0.8);
      expect(corrected['Mathematics & Logic']).toBe(0.2);
      expect(corrected['Earth & Space']).toBeUndefined();

      // Fluid dynamics mistakenly tagged with Earth & Space 1.0
      const badFluid = { 'Earth & Space': 1.0 };
      const correctedFluid = normalizeConceptTopics(badFluid, 'Fluid dynamics');
      expect(correctedFluid['Physics']).toBe(0.8);
      expect(correctedFluid['Earth & Space']).toBe(0.2);

      // Electric charge mistakenly tagged with Chemistry 1.0
      const badCharge = { 'Chemistry': 1.0 };
      const correctedCharge = normalizeConceptTopics(badCharge, 'Electric charge');
      expect(correctedCharge['Physics']).toBe(0.7);
      expect(correctedCharge['Chemistry']).toBe(0.3);
    });

    it('handles empty or missing topics by falling back to inference', () => {
      const normalized = normalizeConceptTopics(undefined, 'Electric charge');
      expect(normalized['Physics']).toBe(0.7);
      expect(normalized['Chemistry']).toBe(0.3);
    });
  });

  describe('Misclassification Detection & Merging', () => {
    it('detects known misclassifications correctly', () => {
      expect(isKnownMisclassification('Velocity', { 'Earth & Space': 1.0 })).toBe(true);
      expect(isKnownMisclassification('Fluid dynamics', { 'Earth & Space': 1.0 })).toBe(true);
      expect(isKnownMisclassification('Electric charge', { 'Chemistry': 1.0 })).toBe(true);
      expect(isKnownMisclassification('Electromagnetic radiation', { 'Chemistry': 1.0 })).toBe(true);

      // Correctly classified
      expect(isKnownMisclassification('Velocity', { 'Physics': 0.8, 'Mathematics & Logic': 0.2 })).toBe(false);
      expect(isKnownMisclassification('Fluid dynamics', { 'Physics': 0.8, 'Earth & Space': 0.2 })).toBe(false);
      expect(isKnownMisclassification('Electric charge', { 'Physics': 0.7, 'Chemistry': 0.3 })).toBe(false);
    });

    it('merges topics prioritizing multi-topic distributions over legacy single topics', () => {
      const prevLegacy = { 'Earth & Space': 1.0 };
      const newDistribution = { 'Physics': 0.8, 'Mathematics & Logic': 0.2 };
      const merged = mergeConceptTopics(newDistribution, prevLegacy, 'Velocity');

      expect(merged['Physics']).toBe(0.8);
      expect(merged['Mathematics & Logic']).toBe(0.2);
    });

    it('fixes legacy misclassifications during merge even if new topics are missing', () => {
      const prevLegacy = { 'Earth & Space': 1.0 };
      const merged = mergeConceptTopics(undefined, prevLegacy, 'Velocity');

      expect(merged['Physics']).toBe(0.8);
      expect(merged['Mathematics & Logic']).toBe(0.2);
    });
  });

  describe('Concept Reclassification', () => {
    it('reclassifies a concept object preserving progress and updating topics', () => {
      const concept: Concept = {
        canonicalName: 'Fluid dynamics',
        definition: 'Study of fluids in motion',
        aliases: ['fluid mechanics'],
        topics: { 'Earth & Space': 1.0 }, // Legacy bad classification
        prerequisites: ['Viscosity'],
        mastery: 'learning',
        reasoningTrack: { ...createDefaultReasoningTrack(), directInference: 2 },
      };

      const reclassified = reclassifyConcept(concept);

      expect(reclassified.canonicalName).toBe('Fluid dynamics');
      expect(reclassified.mastery).toBe('learning');
      expect(reclassified.reasoningTrack.directInference).toBe(2);
      expect(reclassified.topics['Physics']).toBe(0.8);
      expect(reclassified.topics['Earth & Space']).toBe(0.2);
    });

    it('reclassifies multiple concepts in a batch', () => {
      const list: Concept[] = [
        {
          canonicalName: 'Velocity',
          definition: 'Speed with direction',
          aliases: [],
          topics: { 'Earth & Space': 1.0 },
          prerequisites: [],
          mastery: 'unseen',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Electric charge',
          definition: 'Charge on particles',
          aliases: [],
          topics: { 'Chemistry': 1.0 },
          prerequisites: [],
          mastery: 'proficient',
          reasoningTrack: createDefaultReasoningTrack(),
        },
      ];

      const reclassifiedList = reclassifyConcepts(list);

      expect(reclassifiedList[0].topics['Physics']).toBe(0.8);
      expect(reclassifiedList[0].topics['Mathematics & Logic']).toBe(0.2);

      expect(reclassifiedList[1].topics['Physics']).toBe(0.7);
      expect(reclassifiedList[1].topics['Chemistry']).toBe(0.3);
    });
  });

  describe('Helper Functions', () => {
    it('matches canonical topics case-insensitively with fuzzy keywords', () => {
      expect(matchCanonicalTopic('physics')).toBe('Physics');
      expect(matchCanonicalTopic('PHYSICS')).toBe('Physics');
      expect(matchCanonicalTopic('math')).toBe('Mathematics & Logic');
      expect(matchCanonicalTopic('computer science')).toBe('Computer Science');
      expect(matchCanonicalTopic('earth')).toBe('Earth & Space');
      expect(matchCanonicalTopic('unknown-domain')).toBeUndefined();
    });

    it('roundAndNormalizeWeights produces exact 1.0 sum', () => {
      const normalized = roundAndNormalizeWeights({
        'Physics': 0.33333,
        'Chemistry': 0.33333,
        'Life': 0.33333,
      });
      const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 100) / 100).toBe(1.0);
    });
  });
});
