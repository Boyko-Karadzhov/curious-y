import { TOPICS } from '../../types';
import { recordDemoCorrect } from './storage';
import { Concept, Question } from '../../types';
import { findConcept } from '../concepts/registry';
import { calculateMastery, createDefaultReasoningTrack } from '../concepts/mastery';
import { advanceReview, createLearningValueReward, LEARNING_VALUE_TUNING } from '../../../supabase/functions/_shared/learningValue';
import { journeyView, knowledgeGraph, nodeStatus, recordFacet, type LearningGraph } from '../../../supabase/functions/_shared/journey';
import { starterJourney } from '../../../supabase/functions/_shared/journeySeeds';

interface DemoLedger {
  graph?: LearningGraph;
  generation: number;
  day: string;
  lowValueAttempts: number;
  concepts: Record<string, Partial<Concept>>;
  receipts: Record<string, Question & { tributeAnsweredAt?: string }>;
  pending: Question | null;
}
const key = (userId: string) => `curious_y_learning_graph_${userId}`;
const read = (userId: string): DemoLedger => JSON.parse(localStorage.getItem(key(userId)) ?? 'null')
  ?? { generation: 0, day: '', lowValueAttempts: 0, concepts: {}, receipts: {}, pending: null };
export const demoGeneration = (userId: string) => read(userId).generation ?? 0;
export const demoPending = (userId: string) => read(userId).pending;
export function demoJourney(userId: string, topic: string) {
  const ledger = read(userId);
  const graph = ledger.graph ?? { nodes: [], progress: {} };
  if (!graph.nodes.some(n => n.topic === topic && n.kind === 'boss')) {
    const proposal = starterJourney(topic);
    graph.nodes.push(...proposal.nodes.filter(n => !graph.nodes.some(old => old.id === n.id)));
    ledger.graph = graph;
    localStorage.setItem(key(userId), JSON.stringify(ledger));
  }
  return graph;
}
export const demoJourneyView = (userId: string, topic: string) => {
  const view = journeyView(demoJourney(userId, topic));
  return { ...view, nodes: view.nodes.filter(n => n.topic === topic) };
};
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
    const journey = question.graphNodeId ? ledger.graph : undefined;
    if (question.graphNodeId && (!journey || !journey.nodes.some(n => n.id === question.graphNodeId))) throw new Error('Journey expired. Reopen the map.');
    const correct = question.correctIndex === selectedIndex;
    const known = Boolean(c) && Object.prototype.hasOwnProperty.call(LEARNING_VALUE_TUNING.reasoning, question.reasoningComplexity ?? '');
    const successes = Math.max(c?.rewardSuccesses ?? 0, c && !c.isAtomic && (c.mastery !== 'unseen' || Object.values(c.reasoningTrack).some(v => v > 0)) ? 1 : 0);
    if (ledger.day !== now.slice(0, 10)) { ledger.day = now.slice(0, 10); ledger.lowValueAttempts = 0; }
    const facetEvidence = journey && question.graphNodeId && question.graphFacet ? journey.progress[question.graphNodeId]?.[question.graphFacet] : undefined;
    const reward = createLearningValueReward(question.id!, correct, question.topicWeights, question.topic, {
      canonicalConcept: c?.canonicalName ?? question.concept ?? null, metadataKnown: known,
      preMastery: c?.mastery ?? 'unseen', atomic: c?.isAtomic ?? false, successes,
      axisSuccesses: journey ? facetEvidence?.successes ?? 0 : question.reasoningComplexity ? c?.reasoningTrack[question.reasoningComplexity] ?? 0 : 0,
      nextDueAt: journey ? facetEvidence?.nextReviewAt ?? null : c?.nextDueAt ?? null, reasoning: question.reasoningComplexity ?? '',
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
    if (journey && question.graphNodeId && question.graphFacet) {
      const node = journey.nodes.find(n => n.id === question.graphNodeId)!;
      const before = journey.progress[node.id]?.[question.graphFacet];
      journey.progress[node.id] = { ...journey.progress[node.id], [question.graphFacet]: recordFacet(before, correct, question.knowledgeEntry ?? question.explanation, now, question.questionText) };
      const status = nodeStatus(node, journey.progress);
      const old = ledger.concepts[`concept:${node.title}`] ?? {};
      ledger.concepts[`concept:${node.title}`] = { ...old, nextDueAt: Object.values(journey.progress[node.id]).flatMap(p => p?.nextReviewAt ? [p.nextReviewAt] : []).sort()[0] ?? null, mastery: ['mastered', 'completed'].includes(status) ? 'mastered' : status === 'proficient' ? 'proficient' : 'learning' };
    }
    const answered = { ...question, selectedIndex, isCorrect: correct, reward, tributeAnsweredAt: now };
    ledger.receipts[question.id!] = answered; ledger.pending = answered;
    localStorage.setItem(key(userId), JSON.stringify(ledger));
    if (correct) recordDemoCorrect(userId, now);
    return answered;
  };
  return navigator.locks ? navigator.locks.request(`curious_y_phase1_v1_${userId}`, commit) : commit();
}

export const demoKnowledgeGraph = (userId: string) => {
  TOPICS.forEach(topic => demoJourney(userId, topic));
  return knowledgeGraph(read(userId).graph!);
};
