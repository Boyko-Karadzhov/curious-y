import { describe, it, expect } from 'vitest';
import { buildBossQuestionDAG } from '../lib/concepts/dag';
import { Concept, Question, UserSettings } from '../types';
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

describe('Boss Question DAG Construction', () => {
  const dummySettings: UserSettings = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: '',
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

    // Verify concepts have proper reasoningTrack and mastery defaults
    for (const c of result.newConcepts) {
      expect(c.mastery).toBe('unseen');
      expect(c.reasoningTrack).toBeDefined();
      expect(c.reasoningTrack.directInference).toBe(0);
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
});
