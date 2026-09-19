import { expect, it } from 'vitest';
import { journeyQuestionPrompt } from '../../supabase/functions/learning/questionPrompt';
import { preparedJourney, sampleQuestion } from './fixtures/preparedJourney';
import { validateQuestionContent } from '../../supabase/functions/learning/questionContent';
import { DIMENSION_GUIDANCE, knowledgePrompt } from '../../supabase/functions/learning/knowledgePrompts';
import { FACETS, type ConceptNode } from '../../supabase/functions/_shared/journey';

it('tests a domain-specific limit while retaining the definition as supporting context', () => {
    const node = preparedJourney('Life').nodes[0];
    const prompt = journeyQuestionPrompt(node, 'boundaries', {});
    expect(prompt).toContain(DIMENSION_GUIDANCE.boundaries);
    expect(prompt).toContain(node.dimensions.precision);
    expect(prompt).toContain(node.dimensions.boundaries);
    expect(prompt).toContain('not wording recall');
});

it.each(['evidence', 'mechanism', 'alternatives'] as const)('uses the same %s contract and learner label when writing and questioning a lesson', dimension => {
    const node = preparedJourney('Life').nodes[0] as ConceptNode;
    const prompts = [knowledgePrompt(node, []), journeyQuestionPrompt(node, dimension, {})];
    expect(prompts.every(prompt => prompt.includes(DIMENSION_GUIDANCE[dimension]))).toBe(true);
    expect(prompts.every(prompt => prompt.includes(FACETS[dimension].label))).toBe(true);
});

it.each(['\r', '\t', '\b', '\f'])('rejects broken LaTeX JSON escapes (%j)', character => {
    const question = {
        ...sampleQuestion(),
        explanation: `Broken math: $${character}ho_c$`
    };
    expect(() => validateQuestionContent(question)).toThrow('LaTeX backslashes');
});

it('accepts correctly escaped LaTeX and ordinary Markdown line breaks', () => {
    const question = {
        ...sampleQuestion(),
        explanation: '$\\rho_c = 2700\\text{ kg/m}^3$\r\n\nA second paragraph.'
    };
    expect(validateQuestionContent(question)).toEqual(question);
});

it('requires transfer across dimensions for advanced questions and preserves attempt context', () => {
    const node = preparedJourney('Life').nodes[0];
    const prompt = journeyQuestionPrompt(node, 'advanced', { [node.id]: { advanced: {
        attempts: 1,
        successes: 0
    } } });
    expect(prompt).toContain('Combine at least two dimensions');
    expect(prompt).toContain(JSON.stringify(node.dimensions));
    expect(prompt).toContain('"attempts":1,"successes":0');
});
