import { FACETS, type ConceptNode, type Dimension } from '../_shared/journey.ts';
import { BASIC_CONCEPT_RULE } from './curriculumRules.ts';
import { nonempty, objectSchema, stringSchema, structured } from './structured.ts';

const REMAINING_DIMENSIONS = ['boundaries', 'application', 'mechanism', 'alternatives', 'evidence'] as const;
type RemainingDimension = typeof REMAINING_DIMENSIONS[number];
type RemainingKnowledge = Record<RemainingDimension, string>;

const remainingKnowledgeSchema = objectSchema(
    Object.fromEntries(REMAINING_DIMENSIONS.map(dimension => [dimension, stringSchema]))
);

function validateKnowledge(value: unknown): RemainingKnowledge {
    const knowledge = value as RemainingKnowledge;
    if (!knowledge || REMAINING_DIMENSIONS.some(dimension => !nonempty(knowledge[dimension], 1600))) {
        throw new Error('Provide complete, nonempty knowledge for every remaining dimension (maximum 1600 characters each).');
    }

    return knowledge;
}

export async function prepareKnowledge(key: string, node: ConceptNode): Promise<ConceptNode['dimensions']> {
    const known = {
        title: node.title,
        intuition: node.dimensions.intuition,
        formalDefinition: node.dimensions.precision
    };
    const descriptions = REMAINING_DIMENSIONS.map(dimension => `${dimension}: ${FACETS[dimension].description}`).join('\n');
    const generated = await structured(key, `Complete the remaining knowledge dimensions for ONE concept: ${JSON.stringify(known)}.
Preserve the supplied intuition and formal definition exactly; do not generate prerequisites. Return only:
${descriptions}
boundaries: limiting cases, including zero and infinity where meaningful; explain where the model fails.
application: concrete real-world uses and what the idea predicts.
mechanism: why it makes sense, connected to fundamental principles.
alternatives: why it cannot be otherwise under its assumptions; distinguish logical necessity from contingent facts and plausible alternatives.
evidence: how we know, historical discovery and method, and independent validation. Distinguish observation, inference and proof. Do not invent dates or attribution.
Store accurate substantive knowledge, not question prompts, labels, or placeholders. Each dimension at most 1600 characters. ${BASIC_CONCEPT_RULE}`,
    remainingKnowledgeSchema, validateKnowledge);
    return {
        ...node.dimensions,
        ...generated
    } as Record<Dimension, string>;
}
