import { describe, expect, it } from 'vitest';
import { knowledgeGraph, selectJourneyTarget, nextFacet, conceptMastery, topicNodeIds, validateJourneyPlan, type LearningGraph } from '../../supabase/functions/_shared/journey';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
const saved = (): LearningGraph => ({ nodes: starterJourney('Life').nodes, progress: {} });
const learn = (g: LearningGraph, id: string) => {
    const n = g.nodes.find(n => n.id === id)!;
    g.progress[id] = Object.fromEntries(n.facets.map(f => [f, { attempts: 2, successes: 2 }]));
};
describe('Shared concept graph', () => {
    it('reuses existing concepts without checking or changing their redundant display metadata', () => {
        const g = saved();
        g.nodes[2].prerequisiteConcepts = ['old display name'];
        g.nodes[2].requires[0].facets.reverse();
        const before = structuredClone(g.nodes);
        const boss = { ...g.nodes.at(-1)!, id: 'new-boss', title: 'Another question?', prerequisiteConcepts: ['stores', 'feedback'] };
        const result = validateJourneyPlan({ topic: 'Life', nodes: [boss] }, 'Life', g.nodes);
        expect(result.nodes[0].prerequisiteConcepts).toEqual([g.nodes[2].title, g.nodes[3].title]);
        expect(g.nodes).toEqual(before);
    });
    it('reuses unearned concepts across topics and unlocks both bosses from the same evidence', () => {
        const g = saved();
        const other = { ...g.nodes.at(-1)!, id: 'boss-physics', topic: 'Physics', title: 'How does feedback regulate a machine?' };
        expect(validateJourneyPlan({ topic: 'Physics', nodes: [other] }, 'Physics', g.nodes).nodes).toEqual([other]);
        g.nodes.push(other);
        expect(topicNodeIds(g.nodes, 'Physics').has('food-fuel')).toBe(true);
        expect(knowledgeGraph(g).nodes.some(n => n.kind === 'boss')).toBe(false);
        for (const n of g.nodes.filter(n => n.kind === 'concept')) learn(g, n.id);
        const view = knowledgeGraph(g);
        expect(view.nodes.filter(n => n.kind === 'boss')).toHaveLength(2);
        expect(view.nodes.filter(n => n.id === 'feedback')).toHaveLength(1);
        expect(view.nodes.find(n => n.id === 'feedback')!.target).toEqual({ nodeId: 'feedback', facet: 'advanced' });
        expect(selectJourneyTarget(view, 'Physics')?.id).toBe(other.id);
    });
    it('preserves stable node IDs without exposing private data or completion for topics', () => {
        const g = saved(), view = knowledgeGraph(g);
        expect(view.nodes.map(n => n.id)).toEqual(['food-fuel', 'cells']);
        expect(JSON.stringify(view)).not.toMatch(/definition|boss-life|priorKnowledge|chapter|topicMastery|complete/);
        for (const n of g.nodes.slice(2)) expect(JSON.stringify(view)).not.toContain(n.title);
    });
    it('prioritizes an unlocked boss despite unrelated unproficient material', () => {
        const g = saved();
        for (const n of g.nodes.filter(n => n.kind === 'concept')) learn(g, n.id);
        g.nodes.push({ ...g.nodes[0], id: 'unrelated', title: 'Unrelated material' });
        expect(selectJourneyTarget(knowledgeGraph(g), 'Life', () => 0)?.kind).toBe('boss');
        learn(g, 'boss-life');
        expect(selectJourneyTarget(knowledgeGraph(g), 'Life', () => 0.99)?.id).toBe('unrelated');
    });
    it('reduces proficient concept sampling weight when there is no ready boss', () => {
        const g = saved(); learn(g, 'food-fuel');
        const counts: Record<string, number> = {};
        for (let i = 0; i < 1200; i++) {
            const n = selectJourneyTarget(knowledgeGraph(g), undefined, () => (i + .5) / 1200)!;
            counts[n.id] = (counts[n.id] ?? 0) + 1;
        }
        expect(counts).toEqual({ 'food-fuel': 200, cells: 1000 });
        expect(selectJourneyTarget(knowledgeGraph(g), 'Physics')).toBeUndefined();
    });
    it('selects unconfirmed dimensions before review or advanced work', () => {
        const g = saved(); expect(nextFacet(knowledgeGraph(g).nodes[0])).toBe('intuition');
        g.progress['food-fuel'] = { intuition: { attempts: 2, successes: 2, nextReviewAt: '2000-01-01' } };
        expect(nextFacet(knowledgeGraph(g).nodes[0])).toBe('precision');
        learn(g, 'food-fuel'); expect(nextFacet(knowledgeGraph(g).nodes[0])).toBe('advanced');
    });
    it('keeps a fixed mastery denominator per concept as the graph grows', () => {
        const g = saved(), percent = () => conceptMastery(knowledgeGraph(g).nodes[0]);
        expect(percent()).toBe(0);
        g.progress['food-fuel'] = { intuition: { attempts: 1, successes: 1 } }; expect(percent()).toBe(5);
        learn(g, 'food-fuel'); expect(percent()).toBe(82);
        g.progress['food-fuel'].advanced = { attempts: 3, successes: 3 }; expect(percent()).toBe(100);
        g.nodes.push(...starterJourney('Physics').nodes); expect(percent()).toBe(100);
    g.progress['food-fuel'].intuition!.successes = 99; expect(percent()).toBe(100);
    });
    it('rejects duplicate identities but permits a boss with zero new concepts or roots', () => {
        const g = saved(), boss = { ...g.nodes.at(-1)!, id: 'new-boss', title: 'Another question?' };
        expect(validateJourneyPlan({ topic: 'Life', nodes: [boss] }, 'Life', g.nodes).nodes).toHaveLength(1);
        expect(() => validateJourneyPlan({ topic: 'Life', nodes: [boss, { ...g.nodes[0], id: 'copy' }] }, 'Life', g.nodes)).toThrow(/concept/);
        boss.requires[0] = { ...boss.requires[0], nodeId: 'missing' };
        expect(() => validateJourneyPlan({ topic: 'Life', nodes: [boss] }, 'Life', g.nodes)).toThrow(/prerequisite/);
    });
});
