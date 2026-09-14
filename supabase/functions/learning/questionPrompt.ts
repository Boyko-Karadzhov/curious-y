import { FACETS, proficient, type JourneyPlan, type JourneyNode, type Facet, type JourneyProgress } from '../_shared/journey.ts';
import { BASIC_CONCEPT_RULE } from './curriculumRules.ts';
import { ANSWER_RULE } from './questionContent.ts';

function dimensionKnowledge(node: JourneyNode, facet: Facet): string {
    const knowledge = facet === 'advanced' ? JSON.stringify(node.curriculum?.dimensions) : node.curriculum?.dimensions?.[facet];
    if (!knowledge) {
        throw new Error('This concept is missing its prepared dimension knowledge.');
    }

    return knowledge;
}

export function journeyQuestionPrompt(plan: JourneyPlan, node: JourneyNode, facet: Facet, progress: JourneyProgress, history: string[]): string {
    const known = plan.nodes.filter(n => n.id !== node.id && proficient(n, progress[n.id]));
    const entries = Object.entries(progress[node.id] ?? {}).filter(([, p]) => p?.entry).map(([f, p]) => `${f}: ${p?.entry}`);
    const vocabulary = known.map(n => ({
        name: n.title,
        entries: progress[n.id]
    }));
    return `Create one multiple-choice discovery for Curious-Y. The learner thinks BEFORE receiving any explanation.
Topic: ${node.topic}. Target: ${node.title}. Dimension: ${facet} (${FACETS[facet].description}).
Stored dimension knowledge (private author context): ${dimensionKnowledge(node, facet)}
Earned vocabulary: ${JSON.stringify(vocabulary)}
What they have explored about this target: ${entries.join('\n') || 'Nothing yet.'}
Their last attempt in this dimension: ${JSON.stringify(progress[node.id]?.[facet] ?? {})}
${(progress[node.id]?.[facet]?.successes ?? 0) === 1 ? 'This is the SECOND confirmation for this dimension. Choose a different everyday setting and a different reasoning task from the first success. Test the same underlying idea through a fresh prediction, comparison, or changed condition.' : ''}
Only assume ordinary everyday language and the earned vocabulary above. A prerequisite is earned only through successful answers; never treat a technical term as an assumed atomic foundation.
Use a short concrete situation, prediction, comparison, observation, or counterexample. The question does NOT have to begin with Why. No lecture before the options. Ask one thing. Provide enough ordinary-language context to reason or guess. No specialist vocabulary in the question OR options without a brief inline definition. Introduce at most one new technical term. ${BASIC_CONCEPT_RULE}
Stay within this concept; do not reveal the saved boss question. Explain any unearned prerequisite needed for this dimension briefly inline; do not assume it is already known.
${facet === 'advanced' ? `The learner is proficient in every dimension. This is advanced challenge ${Math.min((progress[node.id]?.advanced?.successes ?? 0) + 1, 3)} of 3: use transfer to a new setting for the first success, a changed assumption or limiting case for the second, and evaluation of competing explanations using evidence for the third. Combine at least two earned dimensions. Require reasoning, not recognition of the definition. Never introduce unearned prerequisites just to make it hard. For later reviews use a new synthesis scenario.` : ''}
${ANSWER_RULE} Give four plausible mutually exclusive options, one correct. Wrong answers should reflect specific misconceptions, not nonsense. Avoid length clues. Never use letters, option positions, or all/none of the above in options or feedback. Each answer feedback should respond specifically to its answer: explain the misconception and give a useful clue. Feedback is shown only AFTER a choice. The explanation should explain how to reason to the answer and define any new term it uses.
The knowledgeEntry is a concise, self-contained, accurate statement of THIS dimension that a correct answer demonstrates (maximum 100 words). Do not claim one answer proves mastery. For evidence, distinguish observation, inference, historical discovery, and validation; never invent dates or attribution. For alternatives, distinguish logical necessity from contingency. For precision/boundaries, use math or zero/infinity only when meaningful.
If there was a miss, use a simpler fresh situation addressing it. If there was one success, ask a genuinely different application to check understanding, not a synonym swap. If already confirmed, check transfer or recall. Do not repeat or closely paraphrase any previous question below.
${JSON.stringify(history)}
Return every requested JSON field. Character limits: question 1600, each option 600, explanation 8000, knowledgeEntry 1600, each answer feedback 1400. suggestedQuestions is an array of zero to three short follow-up questions (maximum 300 characters each); use [] if none are useful.  Return the requested JSON.`;
}
