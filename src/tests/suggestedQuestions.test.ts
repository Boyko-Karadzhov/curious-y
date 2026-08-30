import { describe, it, expect } from 'vitest';
import { getSuggestedQuestionsForQuestion } from '../lib/llm/suggestedQuestions';
import { Question } from '../types';

describe('Suggested Questions Generator', () => {
  it('returns embedded suggestedQuestions when available on Question', () => {
    const question: Question = {
      topic: 'Physics',
      questionText: 'Why does light refract?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      explanation: 'Wave phase velocity changes in denser medium according to Snell\'s Law.',
      suggestedQuestions: [
        'How does refractive index relate to phase velocity?',
        'How does Fermat\'s principle derive Snell\'s law?',
      ],
    };

    const suggestions = getSuggestedQuestionsForQuestion(question);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toBe('How does refractive index relate to phase velocity?');
    expect(suggestions[1]).toBe('How does Fermat\'s principle derive Snell\'s law?');
  });

  it('dynamically generates questions asking about key terms and relations when suggestedQuestions is absent', () => {
    const question: Question = {
      topic: 'Physics',
      subtopic: 'Classical mechanics and rotational dynamics',
      questionText: 'Why does a spinning skater rotate faster when pulling their arms inward?',
      options: [
        'Because energy increases',
        'Because moment of inertia decreases, conserving angular momentum',
        'Because friction decreases',
        'Because gravity acts'
      ],
      correctIndex: 1,
      explanation: 'In the absence of external torques, angular momentum $L = I\\omega$ is conserved. Decreasing moment of inertia increases angular velocity.',
    };

    const suggestions = getSuggestedQuestionsForQuestion(question);
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    
    // Check that questions ask about key terms or relations
    const combined = suggestions.join(' ');
    expect(
      combined.includes('moment of inertia') ||
      combined.includes('angular momentum') ||
      combined.includes('$L = I\\omega$') ||
      combined.includes('relationship')
    ).toBe(true);
  });

  it('extracts named laws, formulas, and domain terms to form meaningful follow-up questions', () => {
    const question: Question = {
      topic: 'Chemistry',
      subtopic: 'Thermodynamics and spontaneity',
      questionText: 'Why can an endothermic reaction occur spontaneously at high temperature?',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      explanation: 'According to Gibbs free energy $\\Delta G = \\Delta H - T\\Delta S$, high temperature amplifies positive entropy to make $\\Delta G < 0$.',
    };

    const suggestions = getSuggestedQuestionsForQuestion(question);
    expect(suggestions.length).toBe(4);
    const combined = suggestions.join(' ');
    expect(
      combined.includes('Gibbs') ||
      combined.includes('entropy') ||
      combined.includes('\\Delta G') ||
      combined.includes('relationship')
    ).toBe(true);
  });

  it('provides sensible fallback questions even for minimal inputs', () => {
    const question: Question = {
      topic: 'History',
      questionText: 'Why did the empire decline?',
      options: ['1', '2', '3', '4'],
      correctIndex: 0,
      explanation: 'Multiple economic and political factors combined.',
    };

    const suggestions = getSuggestedQuestionsForQuestion(question);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    for (const s of suggestions) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(10);
      expect(s.endsWith('?')).toBe(true);
    }
  });
});
