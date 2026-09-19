import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FACET_ORDER, FACETS, type ConceptNode } from '../../supabase/functions/_shared/journey';
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
const remaining = Object.fromEntries(FACET_ORDER
    .filter(facet => !['intuition', 'precision'].includes(facet))
    .map(facet => [facet, `Knowledge of ${facet}`]));
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));

beforeEach(() => vi.mocked(callGemini).mockReset());

describe('Concept expansion content', () => {
    it('repairs missing remaining dimensions in the same concept call', async () => {
        reply({ boundaries: 'Only one dimension' });
        reply(remaining);
        const result = await prepareKnowledge('key', node);
        expect(Object.keys(result)).toEqual(FACET_ORDER);
        expect(callGemini).toHaveBeenCalledTimes(2);
        expect(vi.mocked(callGemini).mock.calls[1][1]).toContain('complete, nonempty knowledge');
    });

    it('preserves the generated intuition and formal definition exactly', async () => {
        reply(remaining);
        const result = await prepareKnowledge('key', node);
        expect(result.intuition).toBe(node.dimensions.intuition);
        expect(result.precision).toBe(node.dimensions.precision);
        const prompt = vi.mocked(callGemini).mock.calls[0][1];
        expect(prompt).toContain('do not generate prerequisites');
        for (const facet of Object.keys(remaining) as (keyof typeof FACETS)[]) {
            expect(prompt.split(FACETS[facet].description)).toHaveLength(2);
        }
    });
});
