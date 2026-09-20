import { describe, expect, it } from 'vitest';
import { DIMENSION_ORDER, knowledgeGraph, selectJourneyTarget, nextTarget, conceptMastery, topicNodeIds, validateJourneyPlan, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES } from '../../supabase/functions/_shared/reasoning';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
const saved = (): LearningGraph => ({
    nodes: starterJourney('Life').nodes,
    progress: {}
});
const learn = (g: LearningGraph, id: string) => {
    const n = g.nodes.find(n => n.id === id)!;
    const steps = n.kind === 'concept' ? DIMENSION_ORDER : ['boss'] as const;
    g.progress[id] = Object.fromEntries(steps.map(step => [step, {
        attempts: 1,
        successes: 1
    }]));
};

const master = (g: LearningGraph, id: string) => {
    learn(g, id);
    for (const complexity of REASONING_COMPLEXITIES) {
        g.progress[id][complexity] = {
            attempts: 1,
            successes: 1
        };
    }
};

describe('Shared concept graph', () => {
    it('reuses existing concepts without changing their edges', () => {
        const g = saved();
        const before = structuredClone(g.nodes);
        const boss = {
            ...g.nodes.at(-1)!,
            id: 'new-boss',
            title: 'Another question?',
        };
        const result = validateJourneyPlan({
            topic: 'Life',
            nodes: [boss]
        }, 'Life', g.nodes);
        expect(result.nodes[0].requires.map(edge => edge.nodeId)).toEqual(['stores', 'feedback']);
        expect(g.nodes).toEqual(before);
    });
    it('reuses unearned concepts across topics and unlocks both bosses from the same evidence', () => {
        const g = saved();
        const other = {
            ...g.nodes.at(-1)!,
            id: 'boss-physics',
            topic: 'Physics',
            title: 'How does feedback regulate a machine?'
        };
        expect(validateJourneyPlan({
            topic: 'Physics',
            nodes: [other]
        }, 'Physics', g.nodes).nodes).toEqual([other]);
        g.nodes.push(other);
        expect(topicNodeIds(g.nodes, 'Physics').has('food-fuel')).toBe(true);
        expect(knowledgeGraph(g).nodes.some(n => n.kind === 'boss')).toBe(false);
        for (const n of g.nodes.filter(n => n.kind === 'concept')) {
            master(g, n.id);
        }

        const view = knowledgeGraph(g);
        expect(view.nodes.filter(n => n.kind === 'boss')).toHaveLength(2);
        expect(view.nodes.filter(n => n.id === 'feedback')).toHaveLength(1);
        expect(view.nodes.find(n => n.id === 'feedback')!.target).toEqual({
            nodeId: 'feedback',
            kind: 'dimension',
            dimension: 'intuition'
        });
        expect(selectJourneyTarget(view, 'Physics')?.id).toBe(other.id);
    });
    it('preserves stable node IDs without exposing private data or completion for topics', () => {
        const g = saved(), view = knowledgeGraph(g);
        expect(view.nodes.map(n => n.id)).toEqual(['food-fuel', 'cells']);
        expect(JSON.stringify(view)).not.toMatch(/definition|dimensions|bossQuestion|context|preparation|boss-life|priorKnowledge|chapter|topicMastery|complete/);
        for (const n of g.nodes.filter(n => n.kind === 'boss')) {
            expect(JSON.stringify(view)).not.toContain(n.title);
        }
    });
    it('prioritizes an unlocked boss despite unrelated unproficient material', () => {
        const g = saved();
        for (const n of g.nodes.filter(n => n.kind === 'concept')) {
            master(g, n.id);
        }

        g.nodes.push({
            ...g.nodes[0],
            id: 'unrelated',
            title: 'Unrelated material'
        });
        expect(selectJourneyTarget(knowledgeGraph(g), 'Life', () => 0)?.kind).toBe('boss');
        learn(g, 'boss-life');
        expect(selectJourneyTarget(knowledgeGraph(g), 'Life', () => 0.99)?.id).toBe('unrelated');
    });
    it('samples all unmastered concepts equally, regardless of proficiency', () => {
        const g = saved(); learn(g, 'food-fuel');
        const counts: Record<string, number> = {};
        for (let i = 0; i < 1200; i++) {
            const n = selectJourneyTarget(knowledgeGraph(g), undefined, () => (i + .5) / 1200)!;
            counts[n.id] = (counts[n.id] ?? 0) + 1;
        }

        expect(counts).toEqual({
            'food-fuel': 600,
            cells: 600
        });
        expect(selectJourneyTarget(knowledgeGraph(g), 'Physics')).toBeUndefined();
    });
    it('selects incomplete dimensions before review or reasoning work', () => {
        const g = saved(); expect(nextTarget(knowledgeGraph(g).nodes[0])).toEqual({
            kind: 'dimension',
            dimension: 'intuition'
        });
        g.progress['food-fuel'] = { intuition: {
            attempts: 1,
            successes: 1,
            nextReviewAt: '2000-01-01'
        } };
        expect(nextTarget(knowledgeGraph(g).nodes[0])).toEqual({
            kind: 'dimension',
            dimension: 'precision'
        });
        learn(g, 'food-fuel'); expect(nextTarget(knowledgeGraph(g).nodes[0])).toEqual({
            kind: 'reasoning',
            reasoningComplexity: 'directInference'
        });
    });
    it('keeps a fixed mastery denominator per concept as the graph grows', () => {
        const g = saved(), percent = () => conceptMastery(knowledgeGraph(g).nodes[0]);
        expect(percent()).toBe(0);
        g.progress['food-fuel'] = { intuition: {
            attempts: 1,
            successes: 1
        } }; expect(percent()).toBe(7);
        learn(g, 'food-fuel'); expect(percent()).toBe(50);
        for (const complexity of REASONING_COMPLEXITIES) {
            g.progress['food-fuel'][complexity] = {
                attempts: 1,
                successes: 1
            };
        }

        expect(percent()).toBe(100);
        g.nodes.push(...starterJourney('Physics').nodes); expect(percent()).toBe(100);
    g.progress['food-fuel'].intuition!.successes = 99; expect(percent()).toBe(100);
    });
    it('rejects duplicate identities but permits a boss with zero new concepts or roots', () => {
        const g = saved(), boss = {
            ...g.nodes.at(-1)!,
            id: 'new-boss',
            title: 'Another question?'
        };
        expect(validateJourneyPlan({
            topic: 'Life',
            nodes: [boss]
        }, 'Life', g.nodes).nodes).toHaveLength(1);
        expect(() => validateJourneyPlan({
            topic: 'Life',
            nodes: [boss, {
                ...g.nodes[0],
                id: 'copy'
            }]
        }, 'Life', g.nodes)).toThrow(/concept/);
        boss.requires[0] = {
            ...boss.requires[0],
            nodeId: 'missing'
        };
        expect(() => validateJourneyPlan({
            topic: 'Life',
            nodes: [boss]
        }, 'Life', g.nodes)).toThrow(/prerequisite/);
    });
});
