import type { Json } from './types.ts';

export const TOPICS = [
    'Physics',
    'Mathematics & Logic',
    'Chemistry',
    'Life',
    'Computer Science',
    'Earth & Space',
    'Mind & Behavior',
    'Society & History',
] as const;

const COMPLEXITIES = [
    'directInference',
    'composition',
    'discrimination',
    'transfer',
    'counterfactual',
    'synthesis',
    'derivation',
] as const;

export const QUESTION_SCHEMA: Json = {
    type: 'OBJECT',
    properties: {
        topic: { type: 'STRING', enum: [...TOPICS] },
        subtopic: { type: 'STRING' },
        angle: { type: 'STRING' },
        angleFit: { type: 'STRING' },
        question: { type: 'STRING' },
        options: { type: 'ARRAY', minItems: 4, maxItems: 4, items: { type: 'STRING' } },
        correctIndex: { type: 'INTEGER', minimum: 0, maximum: 3 },
        explanation: { type: 'STRING' },
        suggestedQuestions: { type: 'ARRAY', minItems: 2, maxItems: 4, items: { type: 'STRING' } },
        concept: { type: 'STRING' },
        conceptDefinition: { type: 'STRING' },
        topicWeights: { type: 'OBJECT', properties: Object.fromEntries(TOPICS.map(topic => [topic, { type: 'NUMBER' }])) },
        requiredConcepts: { type: 'ARRAY', maxItems: 6, items: { type: 'STRING' } },
        reasoningComplexity: { type: 'STRING', enum: [...COMPLEXITIES] },
        isBossQuestion: { type: 'BOOLEAN' },
    },
    required: [
        'topic', 'subtopic', 'angle', 'angleFit', 'question', 'options', 'correctIndex',
        'explanation', 'suggestedQuestions', 'concept', 'conceptDefinition',
        'requiredConcepts', 'reasoningComplexity', 'isBossQuestion', 'topicWeights',
    ],
};
