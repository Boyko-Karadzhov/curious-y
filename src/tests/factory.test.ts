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

  it('returns high-quality sample question when no API key is provided', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
      topics: 'Physics, Chemistry',
    };

    const question = await generateWhyQuestion(settings, 'Physics');
    expect(question.topic).toBe('Physics');
    expect(question.questionText).toMatch(/^Why/);
    expect(question.options.length).toBe(4);
    expect(typeof question.correctIndex).toBe('number');
    expect(question.explanation).toBeDefined();
  });

  it('returns helpful message in chat when no API key is provided', async () => {
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
      'Tell me more!'
    );

    expect(reply).toContain('Great question about Calculus');
    expect(reply).toContain('Settings');
  });

  it('validates empty API key in testLLMConnection', async () => {
    const result = await testLLMConnection('anthropic', 'claude-3-5-haiku-20241022', '');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Please enter an API key');
  });
});
