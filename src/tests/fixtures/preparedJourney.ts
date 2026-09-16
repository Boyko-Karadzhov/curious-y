import { starterJourney } from '../../../supabase/functions/_shared/journeySeeds.ts';
import { FACET_ORDER, validateJourneyPlan, type JourneyNode } from '../../../supabase/functions/_shared/journey.ts';
import type { QuestionContent } from '../../../supabase/functions/learning/questionContent';

export const sampleQuestion = (question = 'What can food supply for movement?'): QuestionContent => ({
    question,
    correctAnswer: {
        text: 'Chemical energy',
        feedback: 'Food supplies energy.'
    },
    wrongAnswers: [
        {
            text: 'Energy from nothing',
            feedback: 'Energy is transferred, not created.'
        },
        {
            text: 'A replacement for air',
            feedback: 'Air still matters.'
        },
        {
            text: 'A replacement for rest',
            feedback: 'Rest still matters.'
        },
    ],
    explanation: 'Food contains chemical energy.',
    suggestedQuestions: [],
});

export function prepareFixtureNode(node: JourneyNode): JourneyNode {
    if (node.kind === 'boss') {
        return {
            ...node,
            expanded: true,
            topics: [node.topic],
            preparation: undefined,
            assessment: sampleQuestion(node.title),
            context: {
                angle: 'First principles',
                subtopic: 'Fixture subtopic'
            }
        };
    }

    return {
        ...node,
        expanded: true,
        topics: [node.topic],
        preparation: undefined,
        dimensions: Object.fromEntries(FACET_ORDER.map(f => [f, `${f}: ${node.definition}`]))
    };
}

export function preparedJourney(topic: string) {
    const plan = starterJourney(topic);
    plan.nodes = plan.nodes.map(prepareFixtureNode);
    return validateJourneyPlan(plan, topic);
}
