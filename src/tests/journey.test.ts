import { describe, expect, it } from 'vitest';
import { TOPICS } from '../types';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';
import { journeyView, nodeAvailable, recordFacet, validateJourneyPlan, nextFacet, type JourneyProgress } from '../../supabase/functions/_shared/journey';
import { journeyQuestionPrompt, validateJourneyQuestion } from '../../supabase/functions/learning/journey';

const confirm = () => recordFacet(recordFacet(undefined, true, 'An insight', '2026-09-08T10:00:00Z'), true, 'Confirmed insight', '2026-09-08T10:02:00Z');
describe('Discovery journeys', () => {
  it.each(TOPICS)('%s has a connected, acyclic chapter with accessible roots and a hidden boss', topic => {
    const plan = validateJourneyPlan(starterJourney(topic), topic);
    const view = journeyView({ id: 'saved', chapter: 1, plan, progress: {} });
    expect(view.nodes).toHaveLength(2);
    const serialized = JSON.stringify(view);
    for (const hidden of plan.nodes.slice(2)) { expect(serialized).not.toContain(hidden.title); expect(view.frontiers.some(f => f.id === hidden.id)).toBe(false); }
    expect(serialized).not.toContain('definition');
    expect(serialized).not.toContain(plan.nodes.at(-1)!.title);
    expect(view.complete).toBe(false);
  });
  it('confirms only fresh successes, requires all parents, and does not require optional depth', () => {
    const plan = starterJourney('Life'); const progress: JourneyProgress = {};
    progress['food-fuel'] = { intuition: confirm() };
    expect(nodeAvailable(plan.nodes[2], progress)).toBe(false);
    progress['food-fuel'].mechanism = confirm();
    expect(nodeAvailable(plan.nodes[2], progress)).toBe(true);
    expect(nodeAvailable(plan.nodes[3], progress)).toBe(false);
    progress.cells = { intuition: confirm(), mechanism: confirm() };
    expect(nodeAvailable(plan.nodes[3], progress)).toBe(true);
    const view = journeyView({ id: 'saved', chapter: 1, plan, progress });
    expect(view.nodes[0].status).toBe('understood');
    expect(view.nodes.some(n => n.kind === 'boss')).toBe(false);
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
    const missing = starterJourney('Life'); missing.nodes[2].requires[0].facets = ['precision'];
    expect(() => validateJourneyPlan(missing, 'Life')).toThrow(/prerequisite/);
  });
  it('targets dimensions without forcing Why, rejects unknown assumptions and advanced Life jargon', () => {
    const plan = starterJourney('Life'), node = plan.nodes[0];
    const q = { question: 'What can food provide?', options: ['Fuel', 'Nothing', 'Light', 'Sound'], correctIndex: 0,
      explanation: 'Food contains chemical energy.', knowledgeEntry: 'Food supplies energy.', optionFeedback: ['Yes', 'No', 'No', 'No'], assumedConcepts: [], suggestedQuestions: [] };
    expect(validateJourneyQuestion(q, plan, node, {}, [])).toEqual(q);
    expect(() => validateJourneyQuestion({ ...q, assumedConcepts: ['Enzymes'] }, plan, node, {}, [])).toThrow(/unearned/);
    expect(() => validateJourneyQuestion({ ...q, question: 'What is allosteric enzyme regulation?' }, plan, node, {}, [])).toThrow(/ordinary language/);
    expect(() => validateJourneyQuestion(q, plan, node, {}, [q.question])).toThrow(/new example/);
    const prompt = journeyQuestionPrompt(plan, node, 'boundaries', {}, []);
    expect(prompt).toContain('Dimension: boundaries'); expect(prompt).toContain('thinks BEFORE');
    expect(prompt).not.toContain(plan.nodes.at(-1)!.title);
  });
});
