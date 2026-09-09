import tuning from './learning-value-tuning.json' with { type: 'json' };
import { allocateResources, normalizeTopicWeights, type LearningReward } from './resources.ts';

export const LEARNING_VALUE_TUNING = tuning;
export interface LearningValueInput {
  canonicalConcept: string | null;
  metadataKnown: boolean;
  preMastery: string;
  atomic: boolean;
  successes: number;
  axisSuccesses: number;
  nextDueAt: string | null;
  reasoning: string;
  boss: boolean;
  lowValueAttempts: number;
  answeredAt: string;
}
export interface LearningValueBreakdown {
  version: string;
  inputs: LearningValueInput;
  base: number;
  limits: { minimum: number; maximum: number; lowValueMaximum: number; lowValueFactors: number[] };
  firstSuccess: boolean;
  due: boolean;
  lowValue: boolean;
  factors: Record<'correctness' | 'reasoning' | 'novelty' | 'practice' | 'review' | 'boss' | 'repetition', number>;
  raw: number;
  capped: number;
  rounding: 'nearest-half-up';
}

export function createLearningValueReward(id: string, correct: boolean, weights: unknown, topic: string, input: LearningValueInput): LearningReward {
    const t = tuning;
    const known = input.metadataKnown && Object.prototype.hasOwnProperty.call(t.reasoning, input.reasoning);
    const firstSuccess = known && !input.atomic && correct && input.successes === 0;
    const due = known && !input.atomic && input.successes > 0 && input.nextDueAt !== null
    && Date.parse(input.nextDueAt) <= Date.parse(input.answeredAt);
    const practice = !known || input.atomic || (!due && (input.preMastery === 'mastered' || input.axisSuccesses >= t.axisSuccessLimit));
    const lowValue = !correct || practice;
    const factors = {
        correctness: correct ? 1 : t.incorrect,
        reasoning: known ? t.reasoning[input.reasoning as keyof typeof t.reasoning] : 1,
        novelty: firstSuccess ? t.firstSuccess : 1,
        practice: practice ? t.masteredPractice : 1,
        review: due ? t.dueReview : 1,
        boss: known && !input.atomic && input.boss && correct ? t.boss : 1,
        repetition: lowValue ? (t.lowValueFactors[input.lowValueAttempts] ?? 0) : 1,
    };
    const raw = t.base * factors.correctness * factors.reasoning * factors.novelty * factors.practice * factors.review * factors.boss;
    const capped = Math.min(raw, lowValue ? t.lowValueMaximum : t.maximum) * factors.repetition;
    const totalKnowledge = Math.max(t.minimum, Math.min(t.maximum, Math.floor(capped + 0.5 + 1e-9)));
    const topicWeights = normalizeTopicWeights(weights, topic);
    return { id, correct, totalKnowledge, topicWeights, lines: allocateResources(totalKnowledge, topicWeights, topic),
        calculation: { version: t.version, inputs: { ...input }, base: t.base,
            limits: { minimum: t.minimum, maximum: t.maximum, lowValueMaximum: t.lowValueMaximum, lowValueFactors: [...t.lowValueFactors] },
            firstSuccess, due, lowValue, factors, raw, capped, rounding: 'nearest-half-up' } };
}

export function advanceReview(successes: number, step: number, nextDueAt: string | null, correct: boolean, answeredAt: string, atomic = false) {
    if (atomic) return { reviewStep: 0, nextDueAt: null };
    const due = successes > 0 && nextDueAt !== null && Date.parse(nextDueAt) <= Date.parse(answeredAt);
    if (!correct) return { reviewStep: 0, nextDueAt: successes > 0 ? new Date(Date.parse(answeredAt) + tuning.reviewDays[0] * 86400000).toISOString() : null };
    if (successes > 0 && nextDueAt && !due) return { reviewStep: step, nextDueAt };
    const reviewStep = due ? Math.min(step + 1, tuning.reviewDays.length - 1) : 0;
    return { reviewStep, nextDueAt: new Date(Date.parse(answeredAt) + tuning.reviewDays[reviewStep] * 86400000).toISOString() };
}
