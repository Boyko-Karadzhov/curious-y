import { DIMENSION_ORDER, type ConceptNode, type Dimension } from '../_shared/journey.ts';
import { knowledgePrompt } from './knowledgePrompts.ts';
import { nonempty, objectSchema, stringSchema, structured, validMarkdown } from './structured.ts';

type Knowledge = Record<Dimension, string>;
const knowledgeSchema = objectSchema(Object.fromEntries(DIMENSION_ORDER.map(dimension => [dimension, stringSchema])));

function validateKnowledge(value: unknown): Knowledge {
    const knowledge = value as Knowledge;
    if (!knowledge || Object.keys(knowledge).length !== DIMENSION_ORDER.length
        || DIMENSION_ORDER.some(dimension => !nonempty(knowledge[dimension], 1600))) {
        throw new Error('Provide complete, nonempty knowledge for exactly seven dimensions (maximum 1600 characters each).');
    }

    if (DIMENSION_ORDER.some(dimension => !validMarkdown(knowledge[dimension], 1600))) {
        throw new Error('Invalid Markdown control characters. Double-escape LaTeX backslashes in JSON; use spaces and real newlines for formatting.');
    }

    return Object.fromEntries(DIMENSION_ORDER.map(dimension => [dimension, knowledge[dimension]])) as Knowledge;
}

export async function prepareKnowledge(key: string, node: ConceptNode, prerequisites: ConceptNode[] = []): Promise<Knowledge> {
    return structured(key, knowledgePrompt(node, prerequisites), knowledgeSchema, validateKnowledge, true, 'knowledge');
}
