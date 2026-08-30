import { describe, it, expect } from 'vitest';
import {
  extractJsonFromResponse,
  getQuestionUserPrompt,
  getChatSystemPrompt,
} from '../lib/llm/prompt';
import { Question } from '../types';

describe('LLM Prompts and JSON Extraction', () => {
  it('extracts valid JSON from clean JSON string', () => {
    const raw = '{"topic": "Physics", "question": "Why is the sky blue?", "options": ["A", "B", "C", "D"], "correctIndex": 1, "explanation": "Rayleigh scattering."}';
    const result = extractJsonFromResponse<{ topic: string; question: string }>(raw);
    expect(result.topic).toBe('Physics');
    expect(result.question).toBe('Why is the sky blue?');
  });

  it('extracts JSON from markdown code block fences', () => {
    const raw = 'Here is the question:\n```json\n{"topic": "Chemistry", "question": "Why does salt dissolve in water?", "options": ["1", "2", "3", "4"], "correctIndex": 0, "explanation": "Polarity."}\n```\nHope you like it!';
    const result = extractJsonFromResponse<{ topic: string; question: string }>(raw);
    expect(result.topic).toBe('Chemistry');
    expect(result.question).toBe('Why does salt dissolve in water?');
  });

  it('extracts JSON embedded in conversational text without code fences', () => {
    const raw = 'Sure! Here you go: {"topic": "Algebra", "question": "Why can you not divide by zero?", "options": ["A", "B", "C", "D"], "correctIndex": 2, "explanation": "Undefined."} Let me know if you need anything else.';
    const result = extractJsonFromResponse<{ topic: string; correctIndex: number }>(raw);
    expect(result.topic).toBe('Algebra');
    expect(result.correctIndex).toBe(2);
  });

  it('throws a descriptive error when JSON is invalid', () => {
    const raw = 'This is not json at all';
    expect(() => extractJsonFromResponse(raw)).toThrowError(/invalid response format/i);
  });

  it('formats question user prompt with subtopics, angles, and recent question exclusion', () => {
    const prompt = getQuestionUserPrompt(['Physics', 'Calculus'], 'Physics', [
      'Why do astronauts aboard the ISS experience weightlessness?',
    ]);
    expect(prompt).toContain('Physics');
    expect(prompt).toContain('Why');
    expect(prompt).toContain('Subtopic Focus');
    expect(prompt).toContain('Exploration Angle');
    expect(prompt).toContain('CRITICAL DIVERSITY RULE');
    expect(prompt).toContain('Why do astronauts aboard the ISS experience weightlessness?');
  });

  it('formats chat system prompt with complete context including subtopic and angle', () => {
    const sampleQuestion: Question = {
      topic: 'Calculus',
      subtopic: 'Derivatives and instantaneous rate of change',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      angleFit: 'Examines why the slope of a constant function is zero from first principles.',
      questionText: 'Why is the derivative of a constant zero?',
      options: ['Because it does not change', 'Because infinity', 'Zero divided by zero', 'Arbitrary rule'],
      correctIndex: 0,
      explanation: 'Rate of change of a constant value is zero.',
    };

    const sysPrompt = getChatSystemPrompt(sampleQuestion);
    expect(sysPrompt).toContain('Calculus');
    expect(sysPrompt).toContain('Subtopic: Derivatives and instantaneous rate of change');
    expect(sysPrompt).toContain('Exploration Angle: Focus on a deep underlying first principle');
    expect(sysPrompt).toContain('How Question Fits Angle: Examines why the slope');
    expect(sysPrompt).toContain('Why is the derivative of a constant zero?');
    expect(sysPrompt).toContain('Option A');
    expect(sysPrompt).toContain('Curious-Y');
    expect(sysPrompt).toContain('Rate of change of a constant value is zero.');
  });

  it('extracts suggestedQuestions array from JSON response', () => {
    const raw = JSON.stringify({
      topic: 'Physics',
      question: 'Why does light bend when entering water?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 1,
      explanation: 'Refraction occurs because light slows down.',
      suggestedQuestions: [
        'How does the refractive index n relate to wave phase velocity v = c/n?',
        'How does Fermat\'s principle of least time apply here?',
        'Why does frequency remain constant while wavelength changes?',
      ],
    });

    const result = extractJsonFromResponse<{ suggestedQuestions: string[] }>(raw);
    expect(result.suggestedQuestions).toHaveLength(3);
    expect(result.suggestedQuestions[0]).toContain('refractive index');
    expect(result.suggestedQuestions[1]).toContain('Fermat');
  });

  it('successfully extracts valid structured JSON containing LaTeX formulas', () => {
    const validStructuredJson = JSON.stringify({
      topic: 'Chemistry',
      subtopic: 'Solutions and colligative properties',
      angle: 'Focus on resolving a classic paradox or widespread conceptual misconception in the field.',
      angleFit: 'Addresses entropy changes.',
      question: 'Why does adding a solute elevate boiling point?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 1,
      explanation: 'Adding a solute increases configurational entropy ($\\Delta S$) of the liquid phase. Formula: $\\frac{\\Delta H}{T}$ and $\\text{H}_2\\text{O}$.',
      suggestedQuestions: [
        'How does entropy of mixing alter chemical potential?',
        'Why does entropy dictate freezing point depression?',
        'What role does Raoult\'s law play?',
      ],
    });

    const parsed = extractJsonFromResponse<{
      topic: string;
      correctIndex: number;
      explanation: string;
      options: string[];
      suggestedQuestions: string[];
    }>(validStructuredJson);

    expect(parsed.topic).toBe('Chemistry');
    expect(parsed.correctIndex).toBe(1);
    expect(parsed.options).toHaveLength(4);
    expect(parsed.explanation).toContain('($\\Delta S$)');
    expect(parsed.explanation).toContain('\\frac{\\Delta H}{T}');
    expect(parsed.explanation).toContain('\\text{H}_2\\text{O}');
    expect(parsed.suggestedQuestions).toHaveLength(3);
  });

  it('formats prompt with attention check instructions and previous explanation when wrongQuestionContext is provided', () => {
    const wrongCtx = {
      topic: 'Physics',
      subtopic: 'Classical mechanics (conservation laws, angular momentum)',
      angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
      questionText: 'Why does a spinning ice skater rotate faster when pulling their arms inward?',
      userSelectedOption: 'Because air resistance decreases drastically when arms are tucked in',
      correctOption: 'Because pulling their arms decreases their moment of inertia $I$, conserving angular momentum $L = I\\omega$',
      explanation: 'In the absence of external torques, total angular momentum $L = I \\omega$ is conserved. When the skater pulls in their arms, moment of inertia decreases, requiring angular velocity to increase.',
    };

    const prompt = getQuestionUserPrompt(['Physics'], 'Physics', ['Why do astronauts float on ISS?'], undefined, wrongCtx);

    expect(prompt).toContain('ATTENTION CHECK & CONCEPT REINFORCEMENT TASK');
    expect(prompt).toContain('PREVIOUS QUESTION (ANSWERED INCORRECTLY BY STUDENT)');
    expect(prompt).toContain('Why does a spinning ice skater rotate faster when pulling their arms inward?');
    expect(prompt).toContain('Because air resistance decreases drastically');
    expect(prompt).toContain('Because pulling their arms decreases their moment of inertia');
    expect(prompt).toContain('In the absence of external torques, total angular momentum $L = I \\omega$ is conserved');
    expect(prompt).toContain('The core "why" / reasoning behind the correct answer of this new question MUST be explained in or directly follow from that previous explanation');
    expect(prompt).toContain('This is an intentional attention check to make sure the student read, understood, and retained');
  });
});
