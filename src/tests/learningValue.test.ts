import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceReview, createLearningValueReward, LEARNING_VALUE_TUNING as tuning, LearningValueInput } from '../../supabase/functions/_shared/learningValue';
import { answerDemoQuestion, clearDemoPending, demoConceptProgress, resetDemoLearning } from '../lib/kingdom/demoLearning';
import { loadPendingReward } from '../lib/kingdom/pendingReward';
import { getDueConcepts, findConcept } from '../lib/concepts/registry';
import { createDefaultReasoningTrack, createMasteredReasoningTrack } from '../lib/concepts/mastery';
import { generateEligibleQuestion, findRegistryConcept, RegistryConcept } from '../../supabase/functions/learning/prerequisites';
import { Concept, Question } from '../types';
import { changeKingdom, loadKingdom } from '../lib/kingdom/storage';

const now = '2026-09-06T12:00:00.000Z';
const base: LearningValueInput = { canonicalConcept: 'Force', metadataKnown: true, preMastery: 'learning', atomic: false,
  successes: 1, axisSuccesses: 0, nextDueAt: null, reasoning: 'directInference', boss: false, lowValueAttempts: 0, answeredAt: now };
const score = (input: Partial<LearningValueInput> = {}, correct = true) => createLearningValueReward('q', correct, { Physics: .7, 'Mathematics & Logic': .2, 'Earth & Space': .1 }, 'Physics', { ...base, ...input });
const concept: Concept = { canonicalName: 'Force', aliases: ['push'], definition: 'Force', topics: { Physics: 1 }, prerequisites: [], mastery: 'unseen', reasoningTrack: createDefaultReasoningTrack() };
const question: Question = { id: 'q', topic: 'Physics', topicWeights: { Physics: 1 }, concept: 'push', reasoningComplexity: 'directInference', questionText: 'Why?', correctIndex: 0, options: ['a','b','c','d'], explanation: 'Force' };

describe('versioned learning value', () => {
  beforeEach(() => localStorage.clear());
  it('keeps exact canonical identity ahead of case variants and aliases regardless of registry order', () => {
    const lower = {...concept,canonicalName:'force',aliases:[]};
    expect(findConcept('Force',[lower,concept])).toBe(concept);
    expect(findConcept('force',[concept,lower])).toBe(lower);
    expect(findConcept('push',[lower,concept])).toBe(concept);
    const upperServer: RegistryConcept = {canonical_name:'Force',definition:'Force',aliases:['push'],topics:{Physics:1},prerequisites:[],is_atomic:false,mastery:'unseen'};
    const lowerServer = {...upperServer,canonical_name:'force',aliases:[]};
    expect(findRegistryConcept('Force',[lowerServer,upperServer])).toBe(upperServer);
    expect(findRegistryConcept('force',[upperServer,lowerServer])).toBe(lowerServer);
  });
  it.each(Object.entries(tuning.reasoning))('scores %s and conserves every integer resource', (reasoning, factor) => {
    const reward = score({ reasoning });
    expect(reward.totalKnowledge).toBe(Math.round(20 * factor));
    expect(reward.calculation?.factors.reasoning).toBe(factor);
    expect(reward.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(reward.totalKnowledge);
    expect(reward.lines.every(line => Number.isInteger(line.amount))).toBe(true);
  });
  it('stacks correctness, first success, reasoning and successful boss; bounds the maximum', () => {
    expect(score({ successes: 0, preMastery: 'unseen', reasoning: 'derivation', boss: true }).totalKnowledge).toBe(175);
    const wrong = score({ successes: 0, boss: true }, false);
    expect(wrong.totalKnowledge).toBe(4);
    expect(wrong.calculation?.firstSuccess).toBe(false);
    expect(wrong.calculation?.factors.boss).toBe(1);
    expect(score({ successes: 0 }).lines).toEqual([{key:'force',amount:18},{key:'runes',amount:5},{key:'astral',amount:2}]);
  });
  it('uses pre-answer mastery while preserving the one-resource minimum', () => {
    expect(score({ preMastery: 'mastered' }).totalKnowledge).toBe(6);
    expect(score({ preMastery: 'mastered' }, false).totalKnowledge).toBe(1);
    expect(score({ preMastery: 'proficient' }).totalKnowledge).toBe(20);
    expect(score({ axisSuccesses: 3 }).totalKnowledge).toBe(6);
  });
  it('evaluates exact due boundaries, excludes novelty and ignores reinforcement flags', () => {
    expect(score({ preMastery: 'mastered', nextDueAt: now }).totalKnowledge).toBe(24);
    expect(score({ preMastery: 'mastered', nextDueAt: '2026-09-06T12:00:00.001Z' }).totalKnowledge).toBe(6);
    expect(score({ nextDueAt: '2026-09-06T11:59:59.999Z' }).calculation?.due).toBe(true);
    const first = score({ nextDueAt: now, successes: 0 });
    expect(first.calculation?.due).toBe(false);
    expect(first.calculation?.firstSuccess).toBe(true);
  });
  it('caps low-value farming across question identities and suppresses atomic and missing metadata bonuses', () => {
    expect([0,1,2,3,99].map(lowValueAttempts => score({lowValueAttempts}, false).totalKnowledge)).toEqual([4,2,1,1,1]);
    expect([0,1,2,3].map(lowValueAttempts => score({preMastery:'mastered',lowValueAttempts}, true).totalKnowledge)).toEqual([6,3,2,1]);
    expect([0,1,2,3].map(lowValueAttempts => score({preMastery:'mastered',boss:true,reasoning:'derivation',lowValueAttempts}).totalKnowledge)).toEqual([10,5,3,1]);
    for (const input of [{atomic:true}, {metadataKnown:false}, {reasoning:'invalid'}]) {
      const r = score({...input, successes:0, boss:true, nextDueAt:now});
      expect(r.totalKnowledge).toBe(6);
      expect(r.calculation?.firstSuccess).toBe(false);
      expect(r.calculation?.due).toBe(false);
      expect(r.calculation?.factors.boss).toBe(1);
    }
  });
  it('allocates the minimum as one actual token after rounding and exhausted repetition', () => {
    for (const lowValueAttempts of [1, 2, 3, 99]) {
      const reward = score({preMastery: 'mastered', lowValueAttempts}, false);
      expect(reward.totalKnowledge).toBe(1);
      expect(reward.lines).toEqual([{key: 'force', amount: 1}]);
      expect(reward.calculation?.version).toBe('learning-value-v2');
      expect(reward.calculation?.limits.minimum).toBe(1);
    }
  });
  it('persists the 1/3/7/14/30-day review ladder; early successes preserve due dates and failure restarts at one day', () => {
    let at = now;
    let next = advanceReview(0, 0, null, true, at);
    expect(next.nextDueAt).toBe('2026-09-07T12:00:00.000Z');
    expect(advanceReview(1, 0, next.nextDueAt, true, at)).toEqual(next);
    for (const days of [3,7,14,30,30]) {
      at = next.nextDueAt!;
      next = advanceReview(1, next.reviewStep, at, true, at);
      expect(Date.parse(next.nextDueAt!) - Date.parse(at)).toBe(days * 86400000);
    }
    expect(advanceReview(1, 4, now, false, now)).toEqual({ reviewStep:0, nextDueAt:'2026-09-07T12:00:00.000Z' });
    expect(advanceReview(0, 0, null, false, now).nextDueAt).toBeNull();
    expect(advanceReview(0, 0, null, true, now, true).nextDueAt).toBeNull();
  });
  it('keeps Demo alias receipts immutable and commits attempts, successes, mastery and review together', async () => {
    const a = await answerDemoQuestion('demo', question, 0, [concept], now);
    expect(a.reward?.totalKnowledge).toBe(25);
    expect(loadPendingReward('demo')).toEqual(a);
    expect(await answerDemoQuestion('demo', question, 0, [{...concept,mastery:'mastered'}], '2030-01-01T00:00:00Z')).toEqual(a);
    await expect(answerDemoQuestion('demo', question, 1, [concept], now)).rejects.toThrow('different selection');
    const progress = demoConceptProgress('demo', [concept])[0];
    expect(progress.rewardAttempts).toBe(1); expect(progress.rewardSuccesses).toBe(1);
    expect(progress.mastery).toBe('learning'); expect(progress.nextDueAt).toBe('2026-09-07T12:00:00.000Z');
    clearDemoPending('demo');
    const b = await answerDemoQuestion('demo', {...question,id:'q2',concept:' FORCE '}, 0, [concept], now);
    expect(b.reward?.totalKnowledge).toBe(20); expect(b.reward?.calculation?.firstSuccess).toBe(false);
    expect((await answerDemoQuestion('other', question, 0, [concept], now)).reward?.totalKnowledge).toBe(25);
    resetDemoLearning('demo');
    await expect(answerDemoQuestion('demo', question, 0, [concept], now)).rejects.toThrow('reset');
    expect((await answerDemoQuestion('demo', {...question,demoGeneration:1}, 0, [concept], now)).reward?.totalKnowledge).toBe(25);
  });
  it('makes mastered due practice reachable while preserving prerequisites and atomic exclusions', async () => {
    const due: Concept = {...concept, mastery:'mastered', reasoningTrack:createMasteredReasoningTrack(), rewardSuccesses:21, nextDueAt:now};
    expect(getDueConcepts([due], 'Physics', Date.parse(now))).toEqual([due]);
    expect(getDueConcepts([{...due,prerequisites:['unknown']}], 'Physics', Date.parse(now))).toEqual([]);
    expect(getDueConcepts([{...due,isAtomic:true}], 'Physics', Date.parse(now))).toEqual([]);
    const registry: RegistryConcept[] = [{canonical_name:'Force',definition:'Force',mastery:'mastered',aliases:['push'],topics:{Physics:1},prerequisites:[],is_atomic:false,reward_successes:21,next_due_at:now}];
    let prompt = '';
    const generated = await generateEligibleQuestion(async text => { prompt=text; return {concept:'push',requiredConcepts:[],isBossQuestion:false,reasoningComplexity:'directInference',topic:'Physics',question:'Why does force change motion?'}; }, 'Question', registry, 'Physics', [], Date.parse(now));
    expect(prompt).toContain('Spaced review is due'); expect(generated.concept).toBe('Force');
  });
  it('retries a failed Demo ledger commit without novelty loss, and a late collection cannot clear a newer receipt', async () => {
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota'); });
    await expect(answerDemoQuestion('demo',question,0,[concept],now)).rejects.toThrow('quota');
    fail.mockRestore();
    const [a,b] = await Promise.all([answerDemoQuestion('demo',question,0,[concept],now),answerDemoQuestion('demo',question,0,[concept],now)]);
    expect(a.reward).toEqual(b.reward);
    expect(a.reward?.totalKnowledge).toBe(25);
    const collect = {type:'answer' as const,id:question.id!,topic:'Physics' as const,correct:true,reward:a.reward};
    await changeKingdom('demo',collect);
    const next = await answerDemoQuestion('demo',{...question,id:'next'},0,[concept],now);
    await changeKingdom('demo',collect);
    expect(loadPendingReward('demo')).toEqual(next);
    expect(loadKingdom('demo').tokens.Physics).toBe(25);
    expect(demoConceptProgress('demo',[concept])[0].rewardSuccesses).toBe(2);
  });
});
