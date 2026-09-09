import { describe, expect, it } from 'vitest';
import { validateJourneyAudit } from '../../supabase/functions/learning/journeyAudit';
import { starterJourney } from '../../supabase/functions/_shared/journeySeeds';

const plan = starterJourney('Life');
const finding = { kind: 'missing_prerequisite', nodeId: plan.nodes[0].id, evidence: plan.nodes[0].title,
  reason: 'A required relationship has not been taught.', fix: 'Teach the required relationship first.' };

describe('Curriculum audit contract', () => {
  it('does not turn editorial suggestions into blockers', () => {
    expect(validateJourneyAudit({ blockers: [], suggestions: [
      'Node Fungal Network introduces unearned technical term thread-like structures without basic prerequisites.',
      'Node Nutrient Exchange introduces unearned technical terms chemical building blocks and reciprocal without basic prerequisites.',
      'Node Chemical Signaling introduces unearned technical terms molecular messages and coordinate without basic prerequisites.',
      'Curriculum fails to cover animals, human anatomy, medicine, and genetics, missing the full breadth of the Life topic.',
    ] }, plan)).toEqual([]);
  });
  it.each(['missing_prerequisite', 'factual_error'])('retains evidenced %s findings for repair', kind => {
    const blocker = { ...finding, kind };
    expect(validateJourneyAudit({ blockers: [blocker], suggestions: [] }, plan)).toEqual([blocker]);
  });
  it.each([
    { issues: [] },
    { blockers: [], suggestions: null },
    { blockers: [null], suggestions: [] },
    { blockers: [{ ...finding, kind: 'topic_breadth' }], suggestions: [] },
    { blockers: [{ ...finding, nodeId: 'nonexistent' }], suggestions: [] },
    { blockers: [{ ...finding, evidence: 'An invented quotation' }], suggestions: [] },
    { blockers: [{ ...finding, fix: '' }], suggestions: [] },
  ])('fails closed for malformed or unsupported audit output %#', audit => {
    expect(() => validateJourneyAudit(audit, plan)).toThrow(/audit/i);
  });
});
