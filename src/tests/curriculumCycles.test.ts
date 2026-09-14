import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceCurriculum, newDraft, type CurriculumDraft } from '../../supabase/functions/learning/curriculum';
import { wouldCreatePrerequisiteCycle } from '../../supabase/functions/learning/curriculumDependencies';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { FACET_ORDER, type JourneyNode } from '../../supabase/functions/_shared/journey';
import { prepareFixtureNode } from './fixtures/preparedJourney';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));
const graph = {
    nodes: [],
    progress: {}
};
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const edge = (nodeId: string) => ({
    nodeId,
    facets: [...FACET_ORDER]
});
const match = (name: string, existingId: string) => ({
    name,
    existingId,
    needsLearning: true,
    title: '',
    definition: '',
    topic: ''
});
const knowledge = {
    prerequisites: [],
    dimensions: Object.fromEntries(FACET_ORDER.map(f => [f, `Independent ${f} explanation`]))
};

function concept(id: string, requires: string[] = []): JourneyNode {
    return prepareFixtureNode({
        id,
        title: id.toUpperCase(),
        topic: 'Life',
        kind: 'concept',
        definition: `Meaning of ${id}`,
        facets: [...FACET_ORDER],
        requires: requires.map(edge),
        prerequisiteConcepts: requires.map(id => id.toUpperCase())
    });
}

function cycleDraft(): CurriculumDraft {
    const draft = newDraft('Life');
    const boss = prepareFixtureNode({
        ...concept('boss', ['a']),
        kind: 'boss',
        facets: ['mechanism'],
        title: 'Original boss?'
    });
    return {
        ...draft,
        nodes: [boss, concept('a', ['b']), concept('b')],
        queue: [{
            nodeId: 'b',
            stage: 'match',
            names: ['A']
        }]
    };
}

beforeEach(() => vi.mocked(callGemini).mockReset());

describe('Deterministic cycle prevention', () => {
    it('detects multi-hop cycles while permitting redundant forward edges', () => {
        const nodes = [concept('a', ['b']), concept('b', ['c']), concept('c')];
        expect(wouldCreatePrerequisiteCycle(nodes[2], nodes[0], nodes)).toBe(true);
        expect(wouldCreatePrerequisiteCycle(nodes[0], nodes[2], nodes)).toBe(false);
    });
    it('permits shared prerequisites in a diamond', () => {
        const nodes = [concept('a', ['b', 'c']), concept('b', ['d']), concept('c', ['d']), concept('d')];
        expect(wouldCreatePrerequisiteCycle(nodes[0], nodes[3], nodes)).toBe(false);
        expect(wouldCreatePrerequisiteCycle(nodes[3], nodes[0], nodes)).toBe(true);
        expect(wouldCreatePrerequisiteCycle(nodes[1], nodes[2], nodes)).toBe(false);
    });
    it('detects self-dependencies', () => {
        const node = concept('a');
        expect(wouldCreatePrerequisiteCycle(node, node, [node])).toBe(true);
    });
});

describe('Continuing circular proposals without regeneration', () => {
    it('completes a cyclic match in one call and retains the original boss and knowledge', async () => {
        const draft = cycleDraft();
        const before = structuredClone(draft);
        reply({ matches: [match('A', 'a')] });
        const complete = await advanceCurriculum('key', draft, graph);
        expect(complete.queue).toEqual([]);
        expect(complete.nodes[2].requires).toEqual([]);
        expect(complete.nodes.map(n => n.curriculum)).toEqual(before.nodes.map(n => n.curriculum));
        expect(complete.nodes[0]).toMatchObject({
            id: 'boss',
            title: 'Original boss?',
            requiredMasteryIds: ['b', 'a']
        });
        expect(draft).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
    it.each([false, true])('retains valid additions on either side of a cyclic match (cycle first: %s)', async cycleFirst => {
        const draft = cycleDraft();
        const foundation = {
            ...match('New foundation', ''),
            title: 'New foundation',
            definition: 'New meaning',
            topic: 'Life'
        };
        const matches = cycleFirst ? [match('A', 'a'), foundation] : [foundation, match('A', 'a')];
        draft.queue[0].names = matches.map(m => m.name);
        reply({ matches });
        const result = await advanceCurriculum('key', draft, graph);
        expect(result.nodes).toHaveLength(4);
        expect(result.nodes[2].requires).toEqual([edge(result.nodes[3].id)]);
        expect(result.queue).toEqual([{
            nodeId: result.nodes[3].id,
            stage: 'knowledge'
        }]);
        expect(result.nodes[0]).toEqual(draft.nodes[0]);
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
    it('finishes preparing the retained branch with no cycle repair calls', async () => {
        const draft = cycleDraft();
        draft.queue[0].names = ['A', 'New foundation'];
        reply({ matches: [match('A', 'a'), {
            ...match('New foundation', ''),
            title: 'New foundation',
            definition: 'New meaning',
            topic: 'Life'
        }] });
        const matched = await advanceCurriculum('key', draft, graph);
        reply(knowledge);
        const prepared = await advanceCurriculum('key', matched, graph);
        reply({ concepts: [] });
        const extracted = await advanceCurriculum('key', prepared, graph);
        const complete = await advanceCurriculum('key', extracted, graph);
        expect(complete.queue).toEqual([]);
        expect(complete.nodes[0].requiredMasteryIds).toEqual(expect.arrayContaining(['a', 'b', complete.nodes[3].id]));
        expect(callGemini).toHaveBeenCalledTimes(3);
    });
    it('drops cyclic synonyms while retaining and deduplicating shared prerequisites', async () => {
        const draft = cycleDraft();
        const saved = {
            nodes: [concept('known')],
            progress: { known: { intuition: {
                successes: 2,
                attempts: 2
            } } }
        };
        const before = structuredClone(saved);
        draft.queue[0].names = ['Synonym for A', 'Known', 'Synonym for known', 'B'];
        reply({ matches: [match('Synonym for A', 'a'), match('Known', 'known'), match('Synonym for known', 'known'), match('B', 'b')] });
        const complete = await advanceCurriculum('key', draft, saved);
        expect(complete.queue).toEqual([]);
        expect(complete.nodes[2].requires).toEqual([edge('known')]);
        expect(complete.nodes[2].prerequisiteConcepts).toEqual(['KNOWN']);
        expect(complete.nodes[0].requiredMasteryIds).toEqual(expect.arrayContaining(['a', 'b', 'known']));
        expect(saved).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
    it('propagates provider errors and leaves the saved checkpoint intact', async () => {
        const draft = cycleDraft();
        const before = structuredClone(draft);
        vi.mocked(callGemini).mockRejectedValueOnce(new Error('Provider unavailable'));
        await expect(advanceCurriculum('key', draft, graph)).rejects.toThrow('Provider unavailable');
        expect(draft).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
});
