import type { IConceptDependency } from './curriculum.ts';

export const CONCEPT_EMBEDDING_DIMENSIONS = 768;
export const CONCEPT_EMBEDDING_MODEL = 'gemini-embedding-001';
const BATCH_SIZE = 64;
const TIMEOUT_MS = 60000;

const conceptText = (concept: IConceptDependency) => [
    `Title: ${concept.conceptTitle}`,
    `Formal definition: ${concept.conceptFormalDefinition}`,
    `Intuition: ${concept.conceptIntuition}`
].join('\n');

function embeddingRequest(concept: IConceptDependency) {
    return {
        model: `models/${CONCEPT_EMBEDDING_MODEL}`,
        content: { parts: [{ text: conceptText(concept) }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: CONCEPT_EMBEDDING_DIMENSIONS
    };
}

function normalize(values: unknown): number[] {
    if (!Array.isArray(values) || values.length !== CONCEPT_EMBEDDING_DIMENSIONS
        || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error('The embedding service returned an invalid concept vector.');
    }

    const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    if (!magnitude) {
        throw new Error('The embedding service returned an empty concept vector.');
    }

    return values.map(value => value / magnitude);
}

async function embedBatch(apiKey: string, concepts: IConceptDependency[]): Promise<number[][]> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONCEPT_EMBEDDING_MODEL}:batchEmbedContents`, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify({ requests: concepts.map(embeddingRequest) })
    });
    if (!response.ok) {
        console.error('Gemini embedding request failed', response.status, (await response.text()).split(apiKey).join('[redacted]').slice(0, 500));
        throw new Error('Gemini could not compare this learning material with your knowledge graph. Please retry.');
    }

    const embeddings = (await response.json())?.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== concepts.length) {
        throw new Error('The embedding service returned incomplete concept vectors.');
    }

    return embeddings.map(embedding => normalize(embedding?.values));
}

export async function embedConcepts(apiKey: string, concepts: IConceptDependency[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let offset = 0; offset < concepts.length; offset += BATCH_SIZE) {
        vectors.push(...await embedBatch(apiKey, concepts.slice(offset, offset + BATCH_SIZE)));
    }

    return vectors;
}
