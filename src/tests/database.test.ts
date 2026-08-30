import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUserSettings,
  saveUserSettings,
  saveQuestion,
  updateQuestionAnswer,
  getQuestionHistory,
  saveChatMessage,
  getChatMessages,
  deleteQuestion,
} from '../services/database';
import { UserSettings, Question } from '../types';

describe('Database Service (with localStorage fallback)', () => {
  const testUserId = 'test-user-db-123';

  beforeEach(() => {
    localStorage.clear();
  });

  it('retrieves default user settings when none exist', async () => {
    const settings = await getUserSettings(testUserId);
    expect(settings.provider).toBe('gemini');
    expect(settings.topics).toContain('Physics');
  });

  it('saves and retrieves updated user settings', async () => {
    const newSettings: UserSettings = {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKey: 'sk-ant-test-12345',
      topics: 'Astrophysics, Quantum Mechanics',
    };

    const saved = await saveUserSettings(testUserId, newSettings);
    expect(saved.provider).toBe('anthropic');
    expect(saved.topics).toBe('Astrophysics, Quantum Mechanics');

    const fetched = await getUserSettings(testUserId);
    expect(fetched.provider).toBe('anthropic');
    expect(fetched.apiKey).toBe('sk-ant-test-12345');
  });

  it('saves questions and persists answer updates in history', async () => {
    const question: Question = {
      topic: 'Physics',
      questionText: 'Why does mass warp spacetime?',
      options: ['Curvature of geodesics', 'Electromagnetic pull', 'Dark matter', 'Friction'],
      correctIndex: 0,
      explanation: 'General Relativity shows energy-momentum tensor dictates metric tensor.',
    };

    const savedQ = await saveQuestion(testUserId, question);
    expect(savedQ.id).toBeDefined();

    // Update answer
    await updateQuestionAnswer(testUserId, savedQ.id!, 0, true);

    const history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(1);
    expect(history[0].selectedIndex).toBe(0);
    expect(history[0].isCorrect).toBe(true);
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
      explanation: 'Oxygen has higher electronegativity than hydrogen.',
    };

    const savedQ = await saveQuestion(testUserId, question);
    let history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(1);

    await deleteQuestion(testUserId, savedQ.id!);
    history = await getQuestionHistory(testUserId);
    expect(history.length).toBe(0);
  });
});
