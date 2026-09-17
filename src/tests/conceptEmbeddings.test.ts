import { afterEach, expect, it, vi } from 'vitest';
import {
    CONCEPT_EMBEDDING_DIMENSIONS,
    CONCEPT_EMBEDDING_MODEL,
    embedConcepts
} from '../../supabase/functions/learning/conceptEmbeddings';
import type { IConceptDependency } from '../../supabase/functions/learning/curriculum';

const concept: IConceptDependency = {
    conceptTitle: 'Cell membrane',
    conceptFormalDefinition: 'A selectively permeable lipid boundary.',
    conceptIntuition: 'The cell’s controlled border.',
    dependencies: []
};

afterEach(() => vi.unstubAllGlobals());

it('batches normalized semantic-similarity embeddings', async () => {
    const values = Array.from({ length: CONCEPT_EMBEDDING_DIMENSIONS }, () => 2);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [{ values }] })));
    vi.stubGlobal('fetch', fetchMock);
    const [vector] = await embedConcepts('secret', [concept]);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toContain(`${CONCEPT_EMBEDDING_MODEL}:batchEmbedContents`);
    expect(request.requests[0]).toMatchObject({
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: CONCEPT_EMBEDDING_DIMENSIONS
    });
    expect(request.requests[0].content.parts[0].text).toContain(concept.conceptFormalDefinition);
    expect(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1);
});

it('rejects malformed embedding responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [{ values: [1] }] }))));
    await expect(embedConcepts('secret', [concept])).rejects.toThrow('invalid concept vector');
});
