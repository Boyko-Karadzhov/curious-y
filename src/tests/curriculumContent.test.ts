import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FACET_ORDER, type ConceptNode } from '../../supabase/functions/_shared/journey';
import { prepareKnowledge } from '../../supabase/functions/learning/curriculumContent';
import { callGemini } from '../../supabase/functions/learning/gemini';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));

const node: ConceptNode = {
    id: 'feedback',
    title: 'Feedback',
    topic: 'Life',
    definition: 'A formal definition of feedback.',
    kind: 'concept',
    expanded: false,
    dimensions: {
        intuition: 'A response pushes a changing system back.',
        precision: 'A formal definition of feedback.'
    },
    requires: []
};
const knowledge = Object.fromEntries(FACET_ORDER.map(facet => [facet, `Knowledge of ${facet}`]));

beforeEach(() => vi.mocked(callGemini).mockReset());

describe('Concept expansion', () => {
    it('generates all dimensions in one call without mutating the source', async () => {
        const before = structuredClone(node);
        vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(knowledge));
        expect(await prepareKnowledge('key', node)).toEqual(knowledge);
        expect(node).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(1);
        expect(callGemini).toHaveBeenCalledWith('key', expect.any(String), expect.any(Object), true, 'knowledge');
    });

    it.each([
        '{',
        JSON.stringify({ boundaries: 'Only one dimension' }),
        JSON.stringify({
            ...knowledge,
            precision: 'x'.repeat(1601)
        }),
        JSON.stringify({
            ...knowledge,
            evidence: '   '
        }),
        JSON.stringify({
            ...knowledge,
            unexpected: 'Not a dimension'
        }),
        JSON.stringify({
            ...knowledge,
            precision: 'Broken math: $\rho_c$'
        })
    ])('rejects invalid output after exhausting prompt retries', async invalid => {
        vi.mocked(callGemini).mockResolvedValueOnce(invalid);
        await expect(prepareKnowledge('key', node)).rejects.toThrow('valid learning material');
        expect(callGemini).toHaveBeenCalledTimes(3);
    });

    it('propagates provider failures without another call', async () => {
        vi.mocked(callGemini).mockRejectedValueOnce(new Error('Quota exhausted'));
        await expect(prepareKnowledge('key', node)).rejects.toThrow('Quota exhausted');
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
});
