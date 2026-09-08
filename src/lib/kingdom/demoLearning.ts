import { recordDemoCorrect } from './storage';
import { Concept, Question } from '../../types';
import { findConcept } from '../concepts/registry';
import { calculateMastery, createDefaultReasoningTrack } from '../concepts/mastery';
import { advanceReview, createLearningValueReward, LEARNING_VALUE_TUNING } from '../../../supabase/functions/_shared/learningValue';
import { journeyView, nodeStatus, recordFacet, type SavedJourney } from '../../../supabase/functions/_shared/journey';
import { starterJourney } from '../../../supabase/functions/_shared/journeySeeds';

interface DemoLedger {
  journeys?: Record<string, SavedJourney>;
  generation: number;
  day: string;
  lowValueAttempts: number;
  concepts: Record<string, Partial<Concept>>;
  receipts: Record<string, Question & { tributeAnsweredAt?: string }>;
  pending: Question | null;
}
const key = (userId: string) => `curious_y_learning_value_${userId}`;
const read = (userId: string): DemoLedger => JSON.parse(localStorage.getItem(key(userId)) ?? 'null')
  ?? { generation: 0, day: '', lowValueAttempts: 0, concepts: {}, receipts: {}, pending: null };
export const demoGeneration = (userId: string) => read(userId).generation ?? 0;
export const demoPending = (userId: string) => read(userId).pending;
export function demoJourney(userId: string, topic: string) {
  const ledger = read(userId);
  if (!ledger.journeys?.[topic]) {
    ledger.journeys = { ...ledger.journeys, [topic]: { id: crypto.randomUUID(), chapter: 1, plan: starterJourney(topic), progress: {} } };
    localStorage.setItem(key(userId), JSON.stringify(ledger));
  }
  return ledger.journeys[topic];
}
export const demoJourneyView = (userId: string, topic: string) => journeyView(demoJourney(userId, topic));
export function clearDemoPending(userId: string, questionId?: string) {
  const ledger = read(userId);
  if (questionId && ledger.pending?.id !== questionId) return;
  ledger.pending = null;
  localStorage.setItem(key(userId), JSON.stringify(ledger));
}
export function resetDemoLearning(userId: string) {
  localStorage.setItem(key(userId), JSON.stringify({ generation: demoGeneration(userId) + 1, day: '', lowValueAttempts: 0, concepts: {}, receipts: {}, pending: null }));
}
export function demoConceptProgress(userId: string, concepts: Concept[]): Concept[] {
  const ledger = read(userId);
  return concepts.map(c => ({ ...c, ...ledger.concepts[`concept:${c.canonicalName}`] }));
}
export function demoLibraryConcepts(userId: string): Concept[] {
  const concepts: Concept[] = JSON.parse(localStorage.getItem(`curious_y_user_concepts_${userId}`) ?? '[]');
  return demoConceptProgress(userId, concepts);
}

/** Receipt, counters, review schedule and earned mastery commit in a single localStorage write. */
export async function answerDemoQuestion(userId: string, question: Question, selectedIndex: number, concepts: Concept[], now = new Date().toISOString()): Promise<Question> {
  const commit = () => {
    const ledger = read(userId);
    if ((question.demoGeneration ?? 0) !== (ledger.generation ?? 0)) throw new Error('Question expired because progress was reset.');
    const previous = ledger.receipts[question.id!];
    if (previous) {
      if (previous.selectedIndex !== selectedIndex) throw new Error('Question already answered with a different selection.');
      if (previous.isCorrect && previous.tributeAnsweredAt) recordDemoCorrect(userId, previous.tributeAnsweredAt);
      return previous;
    }
    if (ledger.pending) throw new Error('Collect your Resources before answering another question.');
    const c = findConcept(question.concept ?? '', demoConceptProgress(userId, concepts));
    const journey = question.journeyId ? ledger.journeys?.[question.topic] : undefined;
    if (question.journeyId && (!journey || journey.id !== question.journeyId)) throw new Error('Journey expired. Reopen the map.');
    const correct = question.correctIndex === selectedIndex;
    const known = Boolean(c) && Object.prototype.hasOwnProperty.call(LEARNING_VALUE_TUNING.reasoning, question.reasoningComplexity ?? '');
    const successes = Math.max(c?.rewardSuccesses ?? 0, c && !c.isAtomic && (c.mastery !== 'unseen' || Object.values(c.reasoningTrack).some(v => v > 0)) ? 1 : 0);
    if (ledger.day !== now.slice(0, 10)) { ledger.day = now.slice(0, 10); ledger.lowValueAttempts = 0; }
    const reward = createLearningValueReward(question.id!, correct, question.topicWeights, question.topic, {
      canonicalConcept: c?.canonicalName ?? question.concept ?? null, metadataKnown: known,
      preMastery: c?.mastery ?? 'unseen', atomic: c?.isAtomic ?? false, successes,
      axisSuccesses: question.reasoningComplexity ? c?.reasoningTrack[question.reasoningComplexity] ?? 0 : 0,
      nextDueAt: c?.nextDueAt ?? null, reasoning: question.reasoningComplexity ?? '',
      boss: Boolean(question.isBossQuestion && question.prerequisitesMet && question.requiredConcepts?.length),
      lowValueAttempts: ledger.lowValueAttempts, answeredAt: now,
    });
    if (reward.calculation!.lowValue) ledger.lowValueAttempts = Math.min(ledger.lowValueAttempts + 1, LEARNING_VALUE_TUNING.lowValueFactors.length);
    if (c) {
      const reasoningTrack = { ...createDefaultReasoningTrack(), ...c.reasoningTrack };
      if (correct && question.reasoningComplexity) reasoningTrack[question.reasoningComplexity]++;
      ledger.concepts[`concept:${c.canonicalName}`] = {
        reasoningTrack, mastery: calculateMastery(reasoningTrack, c.isAtomic),
        rewardAttempts: (c.rewardAttempts ?? 0) + 1, rewardSuccesses: successes + (correct && !c.isAtomic ? 1 : 0),
        lastAttemptAt: now, lastSuccessAt: correct && !c.isAtomic ? now : c.lastSuccessAt,
        lastAsked: correct ? now : c.lastAsked,
        ...advanceReview(successes, c.reviewStep ?? 0, c.nextDueAt ?? null, correct, now, c.isAtomic || !known),
      };
    }
    if (journey && question.journeyNodeId && question.journeyFacet) {
      const node = journey.plan.nodes.find(n => n.id === question.journeyNodeId)!;
      const before = journey.progress[node.id]?.[question.journeyFacet];
      journey.progress[node.id] = { ...journey.progress[node.id], [question.journeyFacet]: recordFacet(before, correct, question.knowledgeEntry ?? question.explanation, now) };
      const status = nodeStatus(node, journey.progress);
      const old = ledger.concepts[`concept:${node.title}`] ?? {};
      ledger.concepts[`concept:${node.title}`] = { ...old, mastery: ['deepened', 'retained', 'completed'].includes(status) ? 'mastered' : status === 'understood' ? 'proficient' : 'learning' };
    }
    const answered = { ...question, selectedIndex, isCorrect: correct, reward, tributeAnsweredAt: now };
    ledger.receipts[question.id!] = answered; ledger.pending = answered;
    localStorage.setItem(key(userId), JSON.stringify(ledger));
    if (correct) recordDemoCorrect(userId, now);
    return answered;
  };
  return navigator.locks ? navigator.locks.request(`curious_y_phase1_v1_${userId}`, commit) : commit();
}
