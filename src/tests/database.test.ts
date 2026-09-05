import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveQuestion,
  getQuestionHistory,
  saveChatMessage,
  getChatMessages,
  deleteQuestion,
} from '../services/database';
import { Question } from '../types';

describe('Database Service (with localStorage fallback)', () => {
  const testUserId = 'test-user-db-123';

  beforeEach(() => {
    localStorage.clear();
  });

  it('saves only answered questions and persists them in history', async () => {
    const unansweredQuestion: Question = {
      topic: 'Algebra',
      questionText: 'Why is quadratic formula derived from completing the square?',
      options: ['Geometric area', 'Calculus', 'Random', 'None'],
      correctIndex: 0,
      explanation: 'Completing the square solves the general quadratic equation.',
    };

    // Unanswered question should not appear in history
    await saveQuestion(testUserId, unansweredQuestion);
    let history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(0);

    // Answered question should be saved in history
    const answeredQuestion: Question = {
      topic: 'Physics',
      subtopic: 'Special and general relativity',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Shows how Einstein field equations relate mass-energy to spacetime curvature.',
      questionText: 'Why does mass warp spacetime?',
      options: ['Curvature of geodesics', 'Electromagnetic pull', 'Dark matter', 'Friction'],
      correctIndex: 0,
      selectedIndex: 0,
      isCorrect: true,
      explanation: 'General Relativity shows energy-momentum tensor dictates metric tensor.',
    };

    const savedQ = await saveQuestion(testUserId, answeredQuestion);
    expect(savedQ.id).toBeDefined();
    expect(savedQ.subtopic).toBe('Special and general relativity');
    expect(savedQ.angle).toBe('Focus on a deep underlying first principle or rigorous mathematical derivation.');
    expect(savedQ.angleFit).toBe('Shows how Einstein field equations relate mass-energy to spacetime curvature.');

    history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(1);
    expect(history[0].selectedIndex).toBe(0);
    expect(history[0].isCorrect).toBe(true);
    expect(history[0].subtopic).toBe('Special and general relativity');
    expect(history[0].angle).toBe('Focus on a deep underlying first principle or rigorous mathematical derivation.');
    expect(history[0].angleFit).toBe('Shows how Einstein field equations relate mass-energy to spacetime curvature.');
  });

  it('saves and retrieves follow-up chat messages linked to a question', async () => {
    const questionId = 'q-chem-456';

    await saveChatMessage(testUserId, questionId, 'user', 'What is the role of electronegativity?');
    await saveChatMessage(testUserId, questionId, 'assistant', 'Electronegativity determines bond polarity.');

    const messages = await getChatMessages(testUserId, questionId);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('electronegativity');
    expect(messages[1].role).toBe('assistant');
  });

  it('deletes a question from history', async () => {
    const question: Question = {
      id: 'q-to-delete',
      topic: 'Chemistry',
      questionText: 'Why is water polar?',
      options: ['Bent geometry & electronegativity difference', 'Linear structure', 'Gas', 'None'],
      correctIndex: 0,
      selectedIndex: 0,
      isCorrect: true,
      explanation: 'Oxygen has higher electronegativity than hydrogen.',
    };

    const savedQ = await saveQuestion(testUserId, question);
    let history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(1);

    await deleteQuestion(testUserId, savedQ.id!);
    history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(0);
  });

  it('stores and retrieves questions with canonical topics in history', async () => {
    // Insert questions in local history
    localStorage.setItem(
      `curious_y_questions_history_${testUserId}`,
      JSON.stringify([
        {
          id: 'q-life',
          topic: 'Life',
          questionText: 'Why do mitochondria need a proton gradient?',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 1,
          selectedIndex: 1,
          isCorrect: true,
          explanation: 'Chemiosmosis.',
        },
        {
          id: 'q-math',
          topic: 'Mathematics & Logic',
          questionText: 'Why is derivative of e^x e^x?',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 0,
          selectedIndex: 0,
          isCorrect: true,
          explanation: 'Limit definition.',
        },
      ])
    );

    const history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(2);
    expect(history[0].topic).toBe('Life');
    expect(history[1].topic).toBe('Mathematics & Logic');
  });
});
