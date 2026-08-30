import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseTopicsList,
  generateWhyQuestion,
  sendChatMessage,
  testLLMConnection,
} from '../lib/llm/factory';
import { UserSettings } from '../types';

describe('LLM Factory and Providers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses comma-separated topics list correctly', () => {
    expect(parseTopicsList('Physics, Chemistry, Algebra')).toEqual([
      'Physics',
      'Chemistry',
      'Algebra',
    ]);
    expect(parseTopicsList('  Quantum Mechanics , Biology ,   ')).toEqual([
      'Quantum Mechanics',
      'Biology',
    ]);
    expect(parseTopicsList('')).toEqual([
      'Physics',
      'Chemistry',
      'Algebra',
      'Calculus',
      'History',
    ]);
  });

  it('returns high-quality sample question in demo mode when no API key is provided', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
      topics: 'Physics, Chemistry',
    };

    const question = await generateWhyQuestion(settings, 'Physics', true);
    expect(question.topic).toBe('Physics');
    expect(question.questionText).toMatch(/^Why/);
    expect(question.options.length).toBe(4);
    expect(typeof question.correctIndex).toBe('number');
    expect(question.explanation).toBeDefined();
    expect(question.subtopic).toBeDefined();
    expect(question.angle).toBeDefined();
    expect(question.angleFit).toBeDefined();
  });

  it('requires API key and throws for real user without key', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
      topics: 'Physics, Chemistry',
    };

    await expect(generateWhyQuestion(settings, 'Physics', false)).rejects.toThrow(
      /Please configure your GEMINI API Key/i
    );
  });

  it('returns helpful demo message in chat in demo mode and throws for real user without key', async () => {
    const settings: UserSettings = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: '',
      topics: 'Calculus',
    };

    const reply = await sendChatMessage(
      settings,
      {
        topic: 'Calculus',
        questionText: 'Why is derivative useful?',
        options: ['1', '2', '3', '4'],
        correctIndex: 0,
        explanation: 'Instantaneous rate.',
      },
      [],
      'Tell me more!',
      true
    );

    expect(reply).toContain('Great question about Calculus');
    expect(reply).toContain('Settings');

    await expect(
      sendChatMessage(
        settings,
        {
          topic: 'Calculus',
          questionText: 'Why is derivative useful?',
          options: ['1', '2', '3', '4'],
          correctIndex: 0,
          explanation: 'Instantaneous rate.',
        },
        [],
        'Tell me more!',
        false
      )
    ).rejects.toThrow(/Please configure your OPENAI API Key/i);
  });

  it('validates empty API key in testLLMConnection', async () => {
    const result = await testLLMConnection('anthropic', 'claude-3-5-haiku-20241022', '');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Please enter an API key');
  });

  it('generates non-repeating distinct questions when recentQuestions are provided in demo mode', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
      topics: 'Physics, Chemistry, Calculus, Algebra, History',
    };

    // First question in Calculus
    const q1 = await generateWhyQuestion(settings, 'Calculus', true, []);
    expect(q1.topic).toBe('Calculus');

    // Second question in Calculus with q1 in recentQuestions
    const q2 = await generateWhyQuestion(settings, 'Calculus', true, [q1.questionText]);
    expect(q2.topic).toBe('Calculus');
    expect(q2.questionText).not.toBe(q1.questionText);

    // Third question in Calculus with q1 and q2 in recentQuestions
    const q3 = await generateWhyQuestion(settings, 'Calculus', true, [q2.questionText, q1.questionText]);
    expect(q3.topic).toBe('Calculus');
    expect(q3.questionText).not.toBe(q2.questionText);
    expect(q3.questionText).not.toBe(q1.questionText);
  });
});
