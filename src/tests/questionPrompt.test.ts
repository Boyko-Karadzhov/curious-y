import { expect, it } from 'vitest';
import { journeyQuestionPrompt } from '../../supabase/functions/learning/questionPrompt';
import { preparedJourney, sampleQuestion } from './fixtures/preparedJourney';
import { validateQuestionContent } from '../../supabase/functions/learning/questionContent';

it('targets only the selected dimension knowledge', () => {
    const node = preparedJourney('Life').nodes[0];
    if (node.kind !== 'concept') {
        throw new Error('Expected a concept.');
    }

    node.dimensions.boundaries = 'BOUNDARIES_ONLY_MARKER';
    node.dimensions.precision = 'PRECISION_ONLY_MARKER';
    const prompt = journeyQuestionPrompt(node, {
        kind: 'dimension',
        dimension: 'boundaries'
    });
    expect(prompt).toContain(node.dimensions.boundaries);
    expect(prompt).not.toContain(node.dimensions.precision);
});

it('keeps precision knowledge out of intuition questions', () => {
    const node = preparedJourney('Life').nodes[0];
    if (node.kind !== 'concept') {
        throw new Error('Expected a concept.');
    }

    node.dimensions.intuition = 'Picture fuel as supplies in a pantry.';
    node.dimensions.precision = 'FORMAL_ONLY_MARKER: $E = mc^2$.';
    const prompt = journeyQuestionPrompt(node, {
        kind: 'dimension',
        dimension: 'intuition'
    });
    expect(prompt).toContain(node.dimensions.intuition);
    expect(prompt).not.toContain(node.dimensions.precision);
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

it('provides every dimension for reasoning-complexity questions', () => {
    const node = preparedJourney('Life').nodes[0];
    if (node.kind !== 'concept') {
        throw new Error('Expected a concept.');
    }

    const prompt = journeyQuestionPrompt(node, {
        kind: 'reasoning',
        reasoningComplexity: 'transfer'
    });
    expect(prompt).toContain(JSON.stringify(node.dimensions));
});
