import { type JourneyNode, type Facet, type JourneyProgress } from '../_shared/journey.ts';
import { ANSWER_RULE } from './questionContent.ts';

function dimensionKnowledge(node: JourneyNode, facet: Facet): string {
    if (node.kind !== 'concept' || facet === 'assessment') {
        throw new Error('Only concepts have dimension knowledge.');
    }

    const knowledge = facet === 'advanced' ? JSON.stringify(node.dimensions) : node.dimensions[facet];
    if (!knowledge) {
        throw new Error('This concept is missing its prepared dimension knowledge.');
    }

    return knowledge;
}

export function journeyQuestionPrompt(node: JourneyNode, facet: Facet, progress: JourneyProgress): string {
    return `Create one concise multiple-choice question about a specific piece of knowledge about a concept in ${node.topic}.
Concept: ${node.title}.
Knowledge to be questioned about: ${dimensionKnowledge(node, facet)}
Their last attempt in this dimension: ${JSON.stringify(progress[node.id]?.[facet] ?? {})}
${ANSWER_RULE} Give four plausible mutually exclusive options, one correct. Wrong answers should reflect specific misconceptions, not nonsense. Avoid length clues. Never use letters, option positions, or all/none of the above in options or feedback. Each answer feedback should respond specifically to its answer: explain the misconception and give a useful clue. The explanation should explain how to reason to the answer and define any advanced term it uses.

Return every requested JSON field. Character limits: question 1600, each option 600, explanation 8000, each answer feedback 1400. suggestedQuestions is an array of zero to three short follow-up questions (maximum 300 characters each); use [] if none are useful. Return the requested JSON.`;
}
