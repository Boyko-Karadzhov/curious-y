import { describe, it, expect } from 'vitest';
import { buildBossQuestionDAG, buildQuestionDAG } from '../lib/concepts/dag';
import { Concept, Question, UserSettings } from '../types';
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

describe('Boss Question DAG Construction', () => {
  const dummySettings: UserSettings = {
    apiKey: '',
    hasApiKey: false,
  };

  const bossQuestion: Question = {
    topic: 'Physics',
    subtopic: 'Electromagnetism',
    angle: 'First principles',
    angleFit: 'Examines refractive index and wavefront progression.',
    questionText: 'Why does light bend when entering a denser medium?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 1,
    explanation: "Fermat's principle and Snell's law dictate the path of least time.",
    isBossQuestion: true,
  };

  it('builds DAG for a boss question with empty initial registry in demo mode', async () => {
    const existingRegistry: Concept[] = [];
    const result = await buildBossQuestionDAG(bossQuestion, existingRegistry, dummySettings, true);

    expect(result.newConcepts.length).toBeGreaterThan(0);
    expect(result.directPrerequisites.length).toBeGreaterThan(0);

    // Initial registry had nothing, so prerequisites cannot be proficient yet
    expect(result.allPrerequisitesProficient).toBe(false);

    // Verify concepts have proper reasoningTrack and mastery defaults:
    // Atomic leaves are assumed mastered, while intermediate concepts start unseen
    for (const c of result.newConcepts) {
      if (c.isAtomic) {
        expect(c.mastery).toBe('mastered');
        expect(c.reasoningTrack).toBeDefined();
        expect(c.reasoningTrack.directInference).toBe(3);
      } else {
        expect(c.mastery).toBe('unseen');
        expect(c.reasoningTrack).toBeDefined();
        expect(c.reasoningTrack.directInference).toBe(0);
      }
    }
  });

  it('does not duplicate concepts already registered', async () => {
    // Pre-register "Wavefront" and "Refractive index"
    const existingRegistry: Concept[] = [
      {
        canonicalName: 'Wavefront',
        definition: 'A surface representing points vibrating in unison.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
      {
        canonicalName: 'Refractive index',
        definition: 'Optical density metric.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: ['Wavefront'],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
    ];

    const result = await buildBossQuestionDAG(bossQuestion, existingRegistry, dummySettings, true);

    // Should not re-add Wavefront or Refractive index to newConcepts
    const addedNames = result.newConcepts.map((c) => c.canonicalName);
    expect(addedNames).not.toContain('Wavefront');
    expect(addedNames).not.toContain('Refractive index');
  });

  it('marks allPrerequisitesProficient = true when all direct prerequisites are proficient', async () => {
    // In our curated Physics DAG, direct prerequisites for Snell's law / refraction are:
    // 'Snell\'s law', 'Fermat\'s principle', 'Refractive index', 'Phase velocity', 'Wavefront'
    const fullyProficientRegistry: Concept[] = [
      {
        canonicalName: "Snell's law",
        definition: 'Law of refraction',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
      {
        canonicalName: "Fermat's principle",
        definition: 'Path of least time',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
      {
        canonicalName: 'Refractive index',
        definition: 'Optical density index',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
      {
        canonicalName: 'Phase velocity',
        definition: 'Wave velocity',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
      {
        canonicalName: 'Wavefront',
        definition: 'Wavefront surface',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'proficient',
        reasoningTrack: createDefaultReasoningTrack(),
      },
    ];

    const result = await buildBossQuestionDAG(bossQuestion, fullyProficientRegistry, dummySettings, true);
    expect(result.allPrerequisitesProficient).toBe(true);
  });

  it('strictly validates isAtomic so that only explicit atomic concepts without prerequisites are atomic', async () => {
    const registry: Concept[] = [];
    const result = await buildBossQuestionDAG(bossQuestion, registry, dummySettings, true);

    for (const c of result.newConcepts) {
      if (c.prerequisites && c.prerequisites.length > 0) {
        expect(c.isAtomic).toBe(false);
      }
    }
  });

  it('assumes atomic leaf concepts are mastered and have fully populated reasoning track', async () => {
    const registry: Concept[] = [];
    const result = await buildBossQuestionDAG(bossQuestion, registry, dummySettings, true);

    const atomicConcepts = result.newConcepts.filter((c) => c.isAtomic);
    expect(atomicConcepts.length).toBeGreaterThan(0);
    for (const c of atomicConcepts) {
      expect(c.mastery).toBe('mastered');
      expect(c.reasoningTrack.directInference).toBe(3);
      expect(c.reasoningTrack.composition).toBe(3);
      expect(c.reasoningTrack.discrimination).toBe(3);
      expect(c.reasoningTrack.transfer).toBe(3);
      expect(c.reasoningTrack.counterfactual).toBe(3);
      expect(c.reasoningTrack.synthesis).toBe(3);
      expect(c.reasoningTrack.derivation).toBe(3);
    }
  });

  describe('Concept Question Prerequisite Verification', () => {
    it('marks allPrerequisitesProficient = true for concept question when all its prerequisites are atomic or proficient', async () => {
      // In curated DAG, Phase velocity has prerequisites: Wavelength, Wave frequency (both atomic)
      const phaseVelocityConcept: Concept = {
        canonicalName: 'Phase velocity',
        definition: 'Rate at which wave crests travel.',
        aliases: ['wave velocity'],
        topics: { Physics: 1.0 },
        prerequisites: ['Wavelength', 'Wave frequency'],
        mastery: 'unseen',
        reasoningTrack: createDefaultReasoningTrack(),
      };

      const registryWithAtomicPrereqs: Concept[] = [
        {
          canonicalName: 'Wavelength',
          definition: 'Spatial period.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'mastered',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Wave frequency',
          definition: 'Temporal period.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'mastered',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        phaseVelocityConcept,
      ];

      const conceptQuestion: Question = {
        topic: 'Physics',
        subtopic: 'Phase velocity',
        concept: 'Phase velocity',
        questionText: 'Why is the phase velocity of a wave given by v = lambda * f?',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'Because crests advance at wavelength times frequency.',
      };

      const result = await buildQuestionDAG(
        conceptQuestion,
        registryWithAtomicPrereqs,
        dummySettings,
        true,
        phaseVelocityConcept
      );

      // Phase velocity itself is unseen, but its prerequisites (Wavelength, Wave frequency) are mastered!
      expect(result.allPrerequisitesProficient).toBe(true);
      expect(result.directPrerequisites).toContain('Phase velocity');
    });

    it('marks allPrerequisitesProficient = false for concept question when a prerequisite is NOT proficient', async () => {
      // Refractive index has prerequisites: Speed of light (atomic) and Phase velocity
      const refractiveIndexConcept: Concept = {
        canonicalName: 'Refractive index',
        definition: 'Optical density index.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: ['Speed of light', 'Phase velocity'],
        mastery: 'unseen',
        reasoningTrack: createDefaultReasoningTrack(),
      };

      // Phase velocity is only unseen (NOT proficient)
      const registryWithUnseenPrereq: Concept[] = [
        {
          canonicalName: 'Speed of light',
          definition: 'Universal constant c.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'mastered',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Phase velocity',
          definition: 'Rate at which wave crests travel.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: ['Wavelength', 'Wave frequency'],
          mastery: 'unseen', // NOT PROFICIENT
          reasoningTrack: createDefaultReasoningTrack(),
        },
        refractiveIndexConcept,
      ];

      const conceptQuestion: Question = {
        topic: 'Physics',
        subtopic: 'Refractive index',
        concept: 'Refractive index',
        questionText: 'Why is refractive index n defined as c/v?',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'Because it compares vacuum light speed to phase velocity.',
      };

      const result = await buildQuestionDAG(
        conceptQuestion,
        registryWithUnseenPrereq,
        dummySettings,
        true,
        refractiveIndexConcept
      );

      // Phase velocity is not proficient, so Refractive index question cannot be asked yet!
      expect(result.allPrerequisitesProficient).toBe(false);
    });

    it('marks allPrerequisitesProficient = true once that prerequisite becomes proficient', async () => {
      const refractiveIndexConcept: Concept = {
        canonicalName: 'Refractive index',
        definition: 'Optical density index.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: ['Speed of light', 'Phase velocity'],
        mastery: 'unseen',
        reasoningTrack: createDefaultReasoningTrack(),
      };

      // Phase velocity is now proficient!
      const registryWithProficientPrereq: Concept[] = [
        {
          canonicalName: 'Speed of light',
          definition: 'Universal constant c.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: [],
          isAtomic: true,
          mastery: 'mastered',
          reasoningTrack: createDefaultReasoningTrack(),
        },
        {
          canonicalName: 'Phase velocity',
          definition: 'Rate at which wave crests travel.',
          aliases: [],
          topics: { Physics: 1.0 },
          prerequisites: ['Wavelength', 'Wave frequency'],
          mastery: 'proficient', // PROFICIENT!
          reasoningTrack: createDefaultReasoningTrack(),
        },
        refractiveIndexConcept,
      ];

      const conceptQuestion: Question = {
        topic: 'Physics',
        subtopic: 'Refractive index',
        concept: 'Refractive index',
        questionText: 'Why is refractive index n defined as c/v?',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'Because it compares vacuum light speed to phase velocity.',
      };

      const result = await buildQuestionDAG(
        conceptQuestion,
        registryWithProficientPrereq,
        dummySettings,
        true,
        refractiveIndexConcept
      );

      // Now all prerequisites are proficient!
      expect(result.allPrerequisitesProficient).toBe(true);
    });
  });
});
