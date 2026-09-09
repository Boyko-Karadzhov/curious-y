import { describe, expect, it } from 'vitest';
import { knowledgeGraph, selectJourneyTarget, nextFacet, journeyView, type SavedJourney } from '../../supabase/functions/_shared/journey';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';

const saved = (topic: string, id: string): SavedJourney => ({ id, chapter: 1, plan: starterJourney(topic), progress: {} });
const learn = (j: SavedJourney, nodeId: string) => {
  const n = j.plan.nodes.find(n => n.id === nodeId)!;
  j.progress[nodeId] = Object.fromEntries(n.facets.map(f => [f, { attempts: 2, successes: 2 }]));
};
describe('Unified learning catalog', () => {
  it('namespaces repeated ids across topics and chapters, preserving earned cross-topic edges', () => {
    const life = saved('Life', 'life'), physics = saved('Physics', 'physics');
    const parent = physics.plan.nodes[0]; learn(physics, parent.id);
    life.plan.priorKnowledge = [{ name: parent.title, journeyId: physics.id, nodeId: parent.id, entries: physics.progress[parent.id] }];
    life.plan.nodes[0].prerequisiteConcepts = [parent.title];
    const graph = knowledgeGraph([life, physics]);
    expect(new Set(graph.nodes.map(n => n.id)).size).toBe(graph.nodes.length);
    expect(graph.nodes.find(n => n.id === 'life:food-fuel')?.requires).toContainEqual({ nodeId: `physics:${parent.id}`, facets: parent.facets });
    expect(graph.nodes.find(n => n.id === 'life:food-fuel')?.target).toEqual({ journeyId: 'life', nodeId: 'food-fuel', facet: 'intuition' });
    expect(JSON.stringify(graph)).not.toContain(life.plan.nodes.at(-1)!.title);
    expect(JSON.stringify(graph)).not.toContain('definition');
    const next = saved('Life', 'life-next'); next.chapter = 2;
    expect(knowledgeGraph([life, physics, next]).nodes).toHaveLength(6);
  });
  it('draws equally across available concepts, with lower weight for proficient concepts', () => {
    const j = saved('Life', 'life'); learn(j, 'food-fuel');
    const graph = knowledgeGraph([j]);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1200; i++) {
      const n = selectJourneyTarget(graph, undefined, () => (i + 0.5) / 1200)!;
      counts[n.id] = (counts[n.id] ?? 0) + 1;
    }
    expect(counts).toEqual({ 'life:food-fuel': 200, 'life:cells': 1000 });
    expect(selectJourneyTarget(graph, 'Physics')).toBeUndefined();
    expect(selectJourneyTarget({ ...graph, nodes: [] })).toBeUndefined();
  });
  it('selects the next unconfirmed dimension before reviews or mastery', () => {
    const j = saved('Life', 'life');
    let n = journeyView(j).nodes[0]; expect(nextFacet(n)).toBe('intuition');
    j.progress[n.id] = { intuition: { attempts: 2, successes: 2, nextReviewAt: '2000-01-01' } };
    n = journeyView(j).nodes[0]; expect(nextFacet(n)).toBe(n.facets[1]);
    learn(j, n.id); n = journeyView(j).nodes[0]; expect(nextFacet(n)).toBe('advanced');
  });
  it('measures earned progress across all generated concepts, capped at 100 and including mastery', () => {
    const j = saved('Life', 'life');
    expect(knowledgeGraph([j]).topicMastery?.Life).toBe(0);
    for (const n of j.plan.nodes) learn(j, n.id);
    expect(knowledgeGraph([j]).topicMastery?.Life).toBe(82);
    for (const n of j.plan.nodes) j.progress[n.id].advanced = { attempts: 99, successes: 99 };
    expect(knowledgeGraph([j]).topicMastery?.Life).toBe(100);
    const next = saved('Life', 'next'); next.chapter = 2;
    expect(knowledgeGraph([j, next]).topicMastery?.Life).toBe(50);
  });
  it('does not call a topic complete just because its boss is answered while a concept is unproficient', () => {
    const j = saved('Life', 'life'); learn(j, j.plan.nodes.at(-1)!.id);
    expect(journeyView(j).complete).toBe(false);
  });
});
