import { DIMENSIONS, type ConceptNode, type JourneyStep } from '../_shared/journey.ts';
import { REASONING_COMPLEXITY_INFO } from '../_shared/reasoning.ts';
import { ANSWER_RULE } from './questionContent.ts';

function questionContext(node: ConceptNode, step: Exclude<JourneyStep, { kind: 'boss' }>) {
    if (step.kind === 'dimension') {
        return `Knowledge dimension: ${DIMENSIONS[step.dimension].label}\nKnowledge to question: ${node.dimensions[step.dimension]}`;
    }

    const complexity = REASONING_COMPLEXITY_INFO[step.reasoningComplexity];
    return `Reasoning complexity: ${complexity.name} — ${complexity.description}\nUse these knowledge dimensions as source material: ${JSON.stringify(node.dimensions)}`;
}

export function journeyQuestionPrompt(node: ConceptNode, step: Exclude<JourneyStep, { kind: 'boss' }>): string {
    return `Create one concise multiple-choice reasoning question about ${node.title} in the "${node.topic}" category.
${questionContext(node, step)}
${ANSWER_RULE}`;
}
