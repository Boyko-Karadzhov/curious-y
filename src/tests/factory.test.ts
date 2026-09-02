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
      'Mathematics & Logic',
      'Chemistry',
      'Life',
      'Computer Science',
      'Earth & Space',
      'Mind & Behavior',
      'Society & History',
    ]);
  });

  it('returns high-quality sample question in demo mode when no API key is provided', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
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
    expect(question.suggestedQuestions).toBeDefined();
    expect(Array.isArray(question.suggestedQuestions)).toBe(true);
    expect(question.suggestedQuestions!.length).toBeGreaterThan(0);

    const mathQuestion = await generateWhyQuestion(settings, 'Mathematics & Logic', true);
    expect(mathQuestion.topic).toBe('Mathematics & Logic');
    expect(mathQuestion.options.length).toBe(4);

    const csQuestion = await generateWhyQuestion(settings, 'Computer Science', true);
    expect(csQuestion.topic).toBe('Computer Science');
    expect(csQuestion.options.length).toBe(4);

    const societyQuestion = await generateWhyQuestion(settings, 'Society & History', true);
    expect(societyQuestion.topic).toBe('Society & History');
    expect(societyQuestion.options.length).toBe(4);
  });

  it('requires API key and throws for real user without key', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
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
    };

    const reply = await sendChatMessage(
      settings,
      {
        topic: 'Mathematics & Logic',
        questionText: 'Why is derivative useful?',
        options: ['1', '2', '3', '4'],
        correctIndex: 0,
        explanation: 'Instantaneous rate.',
      },
      [],
      'Tell me more!',
      true
    );

    expect(reply).toContain('Great question about Mathematics & Logic');
    expect(reply).toContain('Settings');

    await expect(
      sendChatMessage(
        settings,
        {
          topic: 'Mathematics & Logic',
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
    };

    // First question in Mathematics & Logic
    const q1 = await generateWhyQuestion(settings, 'Mathematics & Logic', true, []);
    expect(q1.topic).toBe('Mathematics & Logic');

    // Second question in Mathematics & Logic with q1 in recentQuestions
    const q2 = await generateWhyQuestion(settings, 'Mathematics & Logic', true, [q1.questionText]);
    expect(q2.topic).toBe('Mathematics & Logic');
    expect(q2.questionText).not.toBe(q1.questionText);

    // Third question in Mathematics & Logic with q1 and q2 in recentQuestions
    const q3 = await generateWhyQuestion(settings, 'Mathematics & Logic', true, [q2.questionText, q1.questionText]);
    expect(q3.topic).toBe('Mathematics & Logic');
    expect(q3.questionText).not.toBe(q2.questionText);
    expect(q3.questionText).not.toBe(q1.questionText);
  });

  it('generates a reinforcement question with isReinforcement flag when wrongQuestionContext is passed', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
    };

    const wrongCtx = {
      topic: 'Physics',
      subtopic: 'Electromagnetism and optics',
      questionText: 'Why does light bend (refract) when entering a denser medium like water or glass?',
      userSelectedOption: 'Because photons collide with atoms',
      correctOption: 'Because wave crests travel slower in the denser medium',
      explanation: 'According to Fermat\'s principle of least time, light travels slower in denser media.',
    };

    const reinforcement = await generateWhyQuestion(
      settings,
      'Physics',
      true,
      [],
      'test-user',
      wrongCtx
    );

    expect(reinforcement.topic).toBe('Physics');
    expect(reinforcement.isReinforcement).toBe(true);
    expect(reinforcement.reinforcementSourceQuestion).toBe(wrongCtx.questionText);
    expect(reinforcement.questionText).not.toBe(wrongCtx.questionText);
  });
});
