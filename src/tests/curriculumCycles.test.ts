import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expandNode } from '../../supabase/functions/learning/curriculum';
import { wouldCreatePrerequisiteCycle } from '../../supabase/functions/learning/curriculumDependencies';
import { callGemini } from '../../supabase/functions/learning/gemini';
import { FACET_ORDER, type JourneyNode, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { prepareFixtureNode } from './fixtures/preparedJourney';
vi.mock('../../supabase/functions/learning/gemini', () => ({ callGemini: vi.fn() }));

const reply = (value: unknown) => vi.mocked(callGemini).mockResolvedValueOnce(JSON.stringify(value));
const edge = (nodeId: string) => ({ nodeId });
const match = (name: string, existingId: string) => ({
    name,
    existingId,
    needsLearning: true,
    title: '',
    definition: '',
    topic: ''
});

function concept(id: string, requires: string[] = []): JourneyNode {
    return prepareFixtureNode({
        id,
        title: id.toUpperCase(),
        topic: 'Life',
        kind: 'concept',
        definition: `Meaning of ${id}`,
        facets: [...FACET_ORDER],
        requires: requires.map(edge)
    });
}

function cycleGraph(names = ['A']): {
    root: JourneyNode;
    graph: LearningGraph
} {
    const a = concept('a', ['b']);
    const root = {
        ...concept('b'),
        expanded: false,
        requires: [],
        curriculum: {
            ...concept('b').curriculum,
            preparation: {
                stage: 'match' as const,
                names
            }
        }
    };
    return {
        root,
        graph: {
            nodes: [a, root],
            progress: {}
        }
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
    it('drops a closing edge while retaining the generated knowledge', async () => {
        const { root, graph } = cycleGraph();
        const before = structuredClone(root);
        reply({ matches: [match('A', 'a')] });
        const result = await expandNode('key', root, graph);
        expect(result.nodes[0].requires).toEqual([]);
        expect(result.nodes[0].curriculum?.dimensions).toEqual(before.curriculum?.dimensions);
        expect(result.nodes[0].expanded).toBe(true);
        expect(root).toEqual(before);
    });

    it.each([false, true])('retains a valid addition on either side of a cycle (cycle first: %s)', async cycleFirst => {
        const { root, graph } = cycleGraph(['A', 'New foundation']);
        const foundation = {
            ...match('New foundation', ''),
            title: 'New foundation',
            definition: 'New meaning',
            topic: 'Life'
        };
        const matches = cycleFirst ? [match('A', 'a'), foundation] : [foundation, match('A', 'a')];
        reply({ matches });
        const result = await expandNode('key', root, graph);
        expect(result.nodes).toHaveLength(2);
        expect(result.nodes[0].requires).toEqual([edge(result.nodes[1].id)]);
        expect(result.nodes[1]).toMatchObject({
            title: 'New foundation',
            expanded: false
        });
    });

    it('deduplicates a shared prerequisite while dropping cyclic synonyms', async () => {
        const known = concept('known');
        const { root, graph } = cycleGraph(['Synonym for A', 'Known', 'Synonym for known', 'B']);
        graph.nodes.push(known);
        reply({ matches: [
            match('Synonym for A', 'a'),
            match('Known', 'known'),
            match('Synonym for known', 'known'),
            match('B', 'b')
        ] });
        const result = await expandNode('key', root, graph);
        expect(result.nodes[0].requires).toEqual([edge('known')]);
    });

    it('propagates provider errors and leaves the saved node intact', async () => {
        const { root, graph } = cycleGraph();
        const before = structuredClone(root);
        vi.mocked(callGemini).mockRejectedValueOnce(new Error('Provider unavailable'));
        await expect(expandNode('key', root, graph)).rejects.toThrow('Provider unavailable');
        expect(root).toEqual(before);
        expect(callGemini).toHaveBeenCalledTimes(1);
    });
});
