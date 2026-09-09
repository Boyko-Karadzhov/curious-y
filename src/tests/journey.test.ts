import { describe, expect, it } from 'vitest';
import { TOPICS } from '../types';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
import { journeyView, nodeAvailable, nodeStatus, reviewDue, recordFacet, validateJourneyPlan, nextFacet, type JourneyProgress } from '../../supabase/functions/_shared/journey';
import { journeyQuestionPrompt, validateJourneyQuestion } from '../../supabase/functions/learning/journey';

const confirm = () => recordFacet(recordFacet(undefined, true, 'An insight', '2026-09-08T10:00:00Z'), true, 'Confirmed insight', '2026-09-08T10:02:00Z');
describe('Discovery journeys', () => {
  it.each(TOPICS)('%s has a connected, acyclic graph with accessible roots and a hidden boss', topic => {
    const plan = validateJourneyPlan(starterJourney(topic), topic);
    const view = journeyView({ nodes: plan.nodes, progress: {} });
    expect(view.nodes).toHaveLength(2);
    const serialized = JSON.stringify(view);
    for (const hidden of plan.nodes.slice(2)) { expect(serialized).not.toContain(hidden.title); expect(view.frontiers.some(f => f.id === hidden.id)).toBe(false); }
    expect(serialized).not.toContain('definition');
    expect(serialized).not.toContain(plan.nodes.at(-1)!.title);
  });
  it('requires full proficiency in every parent before revealing a dependent concept', () => {
    const plan = starterJourney('Life'); const progress: JourneyProgress = {};
    progress['food-fuel'] = { intuition: confirm(), mechanism: confirm() };
    expect(nodeAvailable(plan.nodes[2], progress)).toBe(false);
    progress['food-fuel'] = Object.fromEntries(plan.nodes[0].facets.map(f => [f, confirm()]));
    expect(nodeStatus(plan.nodes[0], progress)).toBe('proficient');
    expect(nodeAvailable(plan.nodes[2], progress)).toBe(false);
    progress.cells = Object.fromEntries(plan.nodes[1].facets.map(f => [f, confirm()]));
    expect(nodeAvailable(plan.nodes[2], progress)).toBe(true);
    expect(journeyView({ nodes: plan.nodes, progress }).nodes.some(n => n.kind === 'boss')).toBe(false);
    progress['food-fuel'].advanced = { attempts: 4, successes: 2 };
    expect(nodeStatus(plan.nodes[0], progress)).toBe('proficient');
    progress['food-fuel'].advanced.successes = 3;
    expect(nodeStatus(plan.nodes[0], progress)).toBe('mastered');
  });
  it('schedules repeated spaced reviews and preserves earned levels after missed reviews', () => {
    const learned = confirm();
    expect(reviewDue(learned, Date.parse('2026-09-09T10:03:00Z'))).toBe(true);
    const refreshed = recordFacet(learned, true, 'Still known', '2026-09-09T10:03:00Z');
    expect(refreshed.reviewStep).toBe(1);
    expect(refreshed.nextReviewAt).toBe('2026-09-12T10:03:00.000Z');
    expect(reviewDue(refreshed, Date.parse('2026-09-12T10:04:00Z'))).toBe(true);
    const missed = recordFacet(refreshed, false, 'Do not overwrite', '2026-09-12T10:04:00Z');
    expect(missed.successes).toBe(refreshed.successes);
    expect(missed.entry).toBe('Still known');
    expect(missed.reviewStep).toBe(0);
    expect(missed.nextReviewAt).toBe('2026-09-12T10:14:00.000Z');
    expect(reviewDue(undefined)).toBe(false);
  });
  it('does not credit repeated demo answers as new advanced evidence', () => {
    const first = recordFacet(undefined, true, 'Insight', '2026-09-08T10:00:00Z', 'same question');
    const replay = recordFacet(first, true, 'Insight', '2026-09-08T10:01:00Z', 'same question');
    expect(replay.successes).toBe(1);
  });
  it('preserves an insight after a miss and only marks retention after a spaced success', () => {
    const p = recordFacet(undefined, true, 'Energy powers activity.', '2026-09-08T10:00:00Z');
    const miss = recordFacet(p, false, 'Do not save this.', '2026-09-08T10:01:00Z');
    expect(miss.entry).toBe(p.entry); expect(miss.successes).toBe(1); expect(miss.attempts).toBe(2);
    const learned = recordFacet(miss, true, p.entry!, '2026-09-08T10:02:00Z');
    expect(learned.retainedAt).toBeUndefined();
    expect(recordFacet(learned, true, p.entry!, '2026-09-09T10:03:00Z').retainedAt).toBeTruthy();
    expect(nextFacet({ facets: ['intuition', 'mechanism'], progress: { intuition: learned } })).toBe('mechanism');
  });
  it('rejects cycles, orphan nodes and non-existent facet requirements', () => {
    const cycle = starterJourney('Life'); cycle.nodes[0].requires = [{ nodeId: 'stores', facets: ['intuition'] }];
    expect(() => validateJourneyPlan(cycle, 'Life')).toThrow();
    const orphan = starterJourney('Life'); orphan.nodes.push({ ...orphan.nodes[0], id: 'orphan', title: 'Orphan' });
    expect(() => validateJourneyPlan(orphan, 'Life')).toThrow(/Every concept/);
    const missing = starterJourney('Life'); missing.nodes[2].requires[0].facets = ['intuition'];
    expect(() => validateJourneyPlan(missing, 'Life')).toThrow(/prerequisite/);
    const missingNode = starterJourney('Life'); missingNode.nodes[2].requires[0].nodeId = 'unknown-concept';
    expect(() => validateJourneyPlan(missingNode, 'Life')).toThrow(/prerequisite/);
  });
  it('derives prerequisite names from edges regardless of redundant generated labels', () => {
    const plan = starterJourney('Life');
    for (const node of plan.nodes) node.prerequisiteConcepts = node.requires.map(r => r.nodeId);
    const validated = validateJourneyPlan(plan, 'Life');
    for (const node of validated.nodes) {
      expect(node.prerequisiteConcepts).toEqual(node.requires.map(r => validated.nodes.find(n => n.id === r.nodeId)!.title));
    }
  });
  it('targets dimensions without forcing Why, rejects unknown assumptions and advanced Life jargon', () => {
    const plan = starterJourney('Life'), node = plan.nodes[0];
    const q = { question: 'What can food provide?', options: ['Fuel', 'Nothing', 'Light', 'Sound'], correctIndex: 0,
      explanation: 'Food contains chemical energy.', knowledgeEntry: 'Food supplies energy.', optionFeedback: ['Yes', 'No', 'No', 'No'], assumedConcepts: [], suggestedQuestions: [] };
    expect(validateJourneyQuestion(q, plan, node, {}, [])).toEqual(q);
    expect(() => validateJourneyQuestion({ ...q, assumedConcepts: ['Enzymes'] }, plan, node, {}, [])).toThrow(/unearned/);
    expect(journeyQuestionPrompt(plan, node, 'intuition', {}, [])).toContain('There is no fixed list of basic concepts');
    expect(() => validateJourneyQuestion(q, plan, node, {}, [q.question])).toThrow(/new example/);
    const prompt = journeyQuestionPrompt(plan, node, 'boundaries', {}, []);
    expect(prompt).toContain('Dimension: boundaries'); expect(prompt).toContain('thinks BEFORE');
    expect(prompt).not.toContain(plan.nodes.at(-1)!.title);
  });
});
