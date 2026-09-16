import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { matchConcepts, prepareKnowledge } from '../../supabase/functions/learning/curriculumContent';
import { expandNode } from '../../supabase/functions/learning/curriculum';
import { FACET_ORDER } from '../../supabase/functions/_shared/journey';
import { preparedJourney, sampleQuestion } from './fixtures/preparedJourney';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
beforeEach(() => vi.mocked(callGemini).mockReset());

describe('Concept preparation', () => {
    it('rejects missing dimensions and repairs the same concept in its own call', async () => {
        const node = preparedJourney('Life').nodes[0];
        reply({
            prerequisites: [],
            dimensions: { intuition: 'Only one dimension' }
        });
        reply({
            prerequisites: [],
            dimensions: Object.fromEntries(FACET_ORDER.map(f => [f, `Knowledge of ${f}`]))
        });
        const result = await prepareKnowledge('key', node);
        expect(Object.keys(result.dimensions!)).toEqual(FACET_ORDER);
        expect(callGemini).toHaveBeenCalledTimes(2);
        expect(vi.mocked(callGemini).mock.calls[1][1]).toContain('complete, nonempty knowledge');
    });
    it('matches a synonym to the shared graph before basic filtering', async () => {
        const nodes = preparedJourney('Life').nodes;
        reply({ matches: [{
            name: 'Energy from meals',
            existingId: 'food-fuel',
            needsLearning: false,
            title: '',
            definition: '',
            topic: ''
        }] });
        const matched = await matchConcepts('key', ['Energy from meals'], nodes);
        expect(matched[0].existingId).toBe('food-fuel');
        expect(vi.mocked(callGemini).mock.calls[0][1]).toContain('FIRST match');
    });
    it('rejects references invented by the matching model', async () => {
        vi.mocked(callGemini).mockResolvedValue(JSON.stringify({ matches: [{
            name: 'Feedback',
            existingId: 'invented-id',
            needsLearning: true
        }] }));
        await expect(matchConcepts('key', ['Feedback'], [])).rejects.toThrow('Your progress is saved');
        expect(callGemini).toHaveBeenCalledTimes(3);
    });
    it('reuses unearned concepts without regenerating their knowledge', async () => {
        const graph = {
            nodes: preparedJourney('Life').nodes,
            progress: {}
        };
        const boss = {
            ...graph.nodes[4],
            id: 'new-boss',
            topic: 'Physics',
            title: 'A machine question?',
            requires: [],
            expanded: false,
            assessment: sampleQuestion('A machine question?'),
            preparation: {
                stage: 'match' as const,
                names: ['Feedback']
            }
        };
        reply({ matches: [{
            name: 'Feedback',
            existingId: 'feedback',
            needsLearning: false,
            title: '',
            definition: '',
            topic: ''
        }] });
        const result = await expandNode('key', boss, graph);
        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].requires[0].nodeId).toBe('feedback');
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
    it('drops a self-dependency without mutating the saved node', async () => {
        const node = {
            ...preparedJourney('Life').nodes[0],
            expanded: false,
            requires: [],
            preparation: {
                stage: 'match' as const,
                names: ['Food as fuel']
            }
        };
        const before = structuredClone(node);
        reply({ matches: [{
            name: 'Food as fuel',
            existingId: 'food-fuel',
            needsLearning: true,
            title: '',
            definition: '',
            topic: ''
        }] });
        const result = await expandNode('key', node, {
            nodes: [node],
            progress: {}
        });
        expect(result.nodes[0].requires).toEqual([]);
        expect(result.nodes[0].expanded).toBe(true);
        expect(callGemini).toHaveBeenCalledTimes(1);
        expect(node).toEqual(before);
    });
});
