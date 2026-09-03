import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUserConcepts,
  saveUserConcept,
  saveUserConcepts,
  updateConceptAnswer,
  saveQuestion,
  getQuestionHistory,
} from '../services/database';
import { Concept, Question } from '../types';
import { createDefaultReasoningTrack } from '../lib/concepts/mastery';

describe('Database Concept Operations', () => {
  const testUserId = 'test-user-concepts-123';

  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves concepts for a user', async () => {
    const concept: Concept = {
      canonicalName: "Newton's second law",
      definition: 'Force equals mass times acceleration (F=ma).',
      aliases: ['F=ma', 'second law of motion'],
      topics: { Physics: 1.0 },
      prerequisites: ['Inertia', 'Acceleration'],
      mastery: 'unseen',
      reasoningTrack: createDefaultReasoningTrack(),
    };

    await saveUserConcept(testUserId, concept);
    const list = await getUserConcepts(testUserId);

    expect(list.length).toBe(1);
    expect(list[0].canonicalName).toBe("Newton's second law");
    expect(list[0].prerequisites).toEqual(['Inertia', 'Acceleration']);
  });

  it('bulk saves multiple concepts without overriding existing reasoningTrack if already learned', async () => {
    // 1. Initial concept with 1 directInference
    const concept: Concept = {
      canonicalName: "Newton's second law",
      definition: 'Force equals mass times acceleration.',
      aliases: [],
      topics: { Physics: 1.0 },
      prerequisites: [],
      mastery: 'learning',
      reasoningTrack: { ...createDefaultReasoningTrack(), directInference: 1 },
    };
    await saveUserConcept(testUserId, concept);

    // 2. Bulk save with fresh concepts including Newton's second law (track = 0)
    const newBatch: Concept[] = [
      {
        canonicalName: "Newton's second law",
        definition: 'Force equals mass times acceleration.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'unseen',
        reasoningTrack: createDefaultReasoningTrack(),
      },
      {
        canonicalName: 'Inertia',
        definition: 'Tendency of an object to resist changes in its velocity.',
        aliases: [],
        topics: { Physics: 1.0 },
        prerequisites: [],
        mastery: 'unseen',
        reasoningTrack: createDefaultReasoningTrack(),
      },
    ];

    await saveUserConcepts(testUserId, newBatch);
    const list = await getUserConcepts(testUserId);

    expect(list.length).toBe(2);
    const retrievedLaw = list.find((c) => c.canonicalName === "Newton's second law");
    // Preserves progress!
    expect(retrievedLaw?.reasoningTrack.directInference).toBe(1);
    expect(retrievedLaw?.mastery).toBe('learning');
  });

  it('increments reasoning track on correct answer and automatically promotes mastery', async () => {
    const concept: Concept = {
      canonicalName: 'Derivative',
      definition: 'Instantaneous rate of change of a function.',
      aliases: ['differentiation'],
      topics: { 'Mathematics & Logic': 1.0 },
      prerequisites: ['Limits'],
      mastery: 'unseen',
      reasoningTrack: createDefaultReasoningTrack(),
    };
    await saveUserConcept(testUserId, concept);

    // Update with correct answer on directInference
    const updated = await updateConceptAnswer(testUserId, 'Derivative', 'directInference');
    expect(updated).not.toBeNull();
    expect(updated?.reasoningTrack.directInference).toBe(1);
    expect(updated?.mastery).toBe('learning');
    expect(updated?.lastAsked).toBeDefined();

    // Answer again on composition
    const updated2 = await updateConceptAnswer(testUserId, 'Derivative', 'composition');
    expect(updated2?.reasoningTrack.composition).toBe(1);

    // Answer on discrimination
    await updateConceptAnswer(testUserId, 'Derivative', 'discrimination');
    // Bump directInference to 2, composition to 2 (core sum: 2 + 2 + 1 = 5)
    await updateConceptAnswer(testUserId, 'Derivative', 'directInference');
    await updateConceptAnswer(testUserId, 'Derivative', 'composition');
    // Bump transfer to 1, synthesis to 1, derivation to 1 (advanced sum: 3)
    await updateConceptAnswer(testUserId, 'Derivative', 'transfer');
    await updateConceptAnswer(testUserId, 'Derivative', 'synthesis');
    const finalUpdate = await updateConceptAnswer(testUserId, 'Derivative', 'derivation');

    // Mastery should now automatically be proficient!
    expect(finalUpdate?.mastery).toBe('proficient');
  });

  it('persists and retrieves concept, reasoningComplexity, and isBossQuestion on questions', async () => {
    const question: Question = {
      topic: 'Physics',
      subtopic: 'Refraction',
      concept: "Snell's law",
      reasoningComplexity: 'directInference',
      isBossQuestion: false,
      angle: 'First principles',
      angleFit: 'Examines phase boundary.',
      questionText: 'Why does light bend at an interface?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      selectedIndex: 0,
      isCorrect: true,
      explanation: "Snell's law relates angles to refractive indices.",
    };

    const saved = await saveQuestion(testUserId, question);
    expect(saved.concept).toBe("Snell's law");
    expect(saved.reasoningComplexity).toBe('directInference');
    expect(saved.isBossQuestion).toBe(false);

    const history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(1);
    expect(history[0].concept).toBe("Snell's law");
    expect(history[0].reasoningComplexity).toBe('directInference');
  });
});
