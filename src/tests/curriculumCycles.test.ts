import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceCurriculum, newDraft, type CurriculumDraft } from '../../supabase/functions/learning/curriculum';
import { checkPrerequisiteCycle, dependencyContext } from '../../supabase/functions/learning/curriculumDependencies';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { FACET_ORDER, type JourneyNode } from '../../supabase/functions/_shared/journey';
import { prepareFixtureNode, sampleQuestion } from './fixtures/preparedJourney';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));
const graph = { nodes: [], progress: {} };
const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const edge = (nodeId: string) => ({ nodeId, facets: [...FACET_ORDER] });
const match = (name: string, existingId: string) => ({ name, existingId, needsLearning: true, title: '', definition: '', topic: '' });
const knowledge = { prerequisites: [], dimensions: Object.fromEntries(FACET_ORDER.map(f => [f, `Independent ${f} explanation`])) };

function concept(id: string, requires: string[] = []): JourneyNode {
    return prepareFixtureNode({ id, title: id.toUpperCase(), topic: 'Life', kind: 'concept', definition: `Meaning of ${id}`,
        facets: [...FACET_ORDER], requires: requires.map(edge), prerequisiteConcepts: requires.map(id => id.toUpperCase()) });
}

function cycleDraft(): CurriculumDraft {
    const draft = newDraft('Life');
    const boss = prepareFixtureNode({ ...concept('boss', ['a']), kind: 'boss', facets: ['mechanism'], title: 'Original boss?' });
    return { ...draft, nodes: [boss, concept('a', ['b']), concept('b')], queue: [{ nodeId: 'b', stage: 'match', names: ['A'] }] };
}

beforeEach(() => vi.mocked(callGemini).mockReset());

describe('Deterministic cycle prevention', () => {
    it('detects a multi-hop cycle and reports its actual chain', () => {
        const nodes = [concept('a', ['b']), concept('b', ['c']), concept('c')];
        expect(() => checkPrerequisiteCycle(nodes[2], nodes[0], nodes)).toThrow('C -> A -> B -> C');
        expect(() => checkPrerequisiteCycle(nodes[0], nodes[2], nodes)).not.toThrow();
    });
    it('permits shared prerequisites in a diamond', () => {
        const nodes = [concept('a', ['b', 'c']), concept('b', ['d']), concept('c', ['d']), concept('d')];
        expect(() => checkPrerequisiteCycle(nodes[0], nodes[3], nodes)).not.toThrow();
        expect(() => checkPrerequisiteCycle(nodes[3], nodes[0], nodes)).toThrow('D -> A -> B -> D');
    });
    it('tells generation which concepts depend on the current target', () => {
        const nodes = [concept('a', ['b']), concept('b'), concept('independent')];
        const context = dependencyContext(nodes[1], nodes);
        expect(context).toContain('"title":"A"');
        expect(context).toContain('"title":"B"');
        expect(context).not.toContain('INDEPENDENT');
        expect(context).toContain('including under synonyms');
    });
});

describe('Repairing saved circular proposals', () => {
    it('rolls back all additions from a failed batch before saving a repair', async () => {
        const draft = cycleDraft();
        draft.queue[0].names = ['New foundation', 'A'];
        const before = structuredClone(draft);
        reply({ matches: [{ ...match('New foundation', ''), title: 'New foundation', definition: 'New meaning', topic: 'Life' }, match('A', 'a')] });
        const result = await advanceCurriculum('key', draft, graph);
        expect(result.nodes).toEqual(before.nodes);
        expect(result.queue).toEqual([{ nodeId: 'b', stage: 'knowledge', repairs: 1, feedback: expect.stringContaining('B -> A -> B') }]);
        expect(draft).toEqual(before);
    });
    it('repairs an old checkpoint, replaces stale prerequisites and finishes an acyclic graph', async () => {
        reply({ matches: [match('A', 'a')] });
        const repairing = await advanceCurriculum('key', cycleDraft(), graph);
        reply(knowledge);
        const prepared = await advanceCurriculum('key', repairing, graph);
        expect(prepared.queue[0].names).toEqual([]);
        expect(vi.mocked(callGemini).mock.calls[1][1]).toContain('B -> A -> B');
        reply({ concepts: [] });
        const extracted = await advanceCurriculum('key', prepared, graph);
        const complete = await advanceCurriculum('key', extracted, graph);
        expect(complete.queue).toEqual([]);
        expect(complete.nodes[2].requires).toEqual([]);
        expect(complete.nodes[0].requiredMasteryIds).toEqual(expect.arrayContaining(['a', 'b']));
    });
    it('saves a bounded restart after repeated repairs and replaces the pending boss stage', async () => {
        const draft = cycleDraft();
        draft.queue[0].repairs = 2;
        reply({ matches: [match('A', 'a')] });
        const restarted = await advanceCurriculum('key', draft, graph);
        expect(restarted).toMatchObject({ restarts: 1, nodes: [], rejectedBosses: ['Original boss?'], queue: [{ stage: 'boss' }] });
        reply(sampleQuestion('A simpler boss?'));
        const prepared = await advanceCurriculum('key', restarted, graph);
        expect(prepared.queue).toHaveLength(1);
        expect(prepared.queue[0].stage).toBe('dependencies');
        expect(vi.mocked(callGemini).mock.calls[1][1]).toContain('Choose a simpler, different question');
    });
    it('bounds persistent invalid generation without leaking the internal cycle error', async () => {
        const draft = cycleDraft();
        draft.queue[0].repairs = 2;
        draft.restarts = 2;
        reply({ matches: [match('A', 'a')] });
        await expect(advanceCurriculum('key', draft, graph)).rejects.toThrow('Your progress is saved');
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
    it('preserves existing shared concepts and progress during a draft repair', async () => {
        const saved = { nodes: [concept('known')], progress: { known: { intuition: { successes: 2, attempts: 2 } } } };
        const before = structuredClone(saved);
        reply({ matches: [match('A', 'a')] });
        await advanceCurriculum('key', cycleDraft(), saved);
        expect(saved).toEqual(before);
    });
});
