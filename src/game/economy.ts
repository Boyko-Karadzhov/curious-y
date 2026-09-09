import { Question } from '../types';

import { type LearningReward, type KnowledgeResourceKey } from '../../supabase/functions/_shared/resources';
import { createLearningValueReward, type LearningValueInput } from '../../supabase/functions/_shared/learningValue';
export { KNOWLEDGE_RESOURCES, type KnowledgeResourceKey, type KnowledgeResource } from '../../supabase/functions/_shared/resources';

export type KnowledgeBalances = Record<KnowledgeResourceKey, number>;

export type { LearningReward, RewardLine } from '../../supabase/functions/_shared/resources';

export interface GameState {
  dayStamp: string;
  castleLevel: number;
  castleXp: number;
  gold: number;
  gems: number;
  keys: number;
  knowledge: KnowledgeBalances;
  answersToday: number;
  correctToday: number;
  dailyClaimed: boolean;
  streak: number;
  trophies: number;
  warPressure: number;
}

export const createInitialGameState = (): GameState => ({
    dayStamp: new Date().toISOString().slice(0, 10),
    castleLevel: 1,
    castleXp: 0,
    gold: 0,
    gems: 0,
    keys: 0,
    knowledge: {
        force: 0,
        runes: 0,
        reagents: 0,
        essence: 0,
        cores: 0,
        astral: 0,
        insight: 0,
        influence: 0,
    },
    answersToday: 0,
    correctToday: 0,
    dailyClaimed: false,
    streak: 0,
    trophies: 1000,
    warPressure: 50,
});

// Without pre-answer state, local simulation callers receive the conservative fallback.
export const calculateLearningReward = (question: Question, correct: boolean, topicWeights?: Record<string, number>, input?: LearningValueInput): LearningReward =>
    createLearningValueReward(question.id ?? crypto.randomUUID(), correct, question.topicWeights ?? topicWeights, question.topic, input ?? {
        canonicalConcept: null, metadataKnown: false, preMastery: 'unseen', atomic: false, successes: 0,
        axisSuccesses: 0, nextDueAt: null, reasoning: '', boss: false, lowValueAttempts: 0, answeredAt: new Date().toISOString(),
    });

export const applyLearningReward = (state: GameState, reward: LearningReward): GameState => {
    const knowledge = { ...state.knowledge };
    reward.lines.forEach(({ key, amount }) => {
        knowledge[key] += amount;
    });

    return {
        ...state,
        knowledge,
        answersToday: state.answersToday + 1,
        correctToday: state.correctToday + (reward.correct ? 1 : 0),
        castleXp: Math.min(100, state.castleXp + (reward.correct ? 8 : 2)),
        warPressure: Math.min(94, state.warPressure + (reward.correct ? 2 : 0.5)),
    };
};

export const CASTLE_UPGRADE_COST = { force: 100, runes: 75, gold: 500 } as const;

export const canUpgradeCastle = (state: GameState): boolean =>
    state.knowledge.force >= CASTLE_UPGRADE_COST.force &&
  state.knowledge.runes >= CASTLE_UPGRADE_COST.runes &&
  state.gold >= CASTLE_UPGRADE_COST.gold;

export const upgradeCastle = (state: GameState): GameState => {
    if (!canUpgradeCastle(state)) return state;
    return {
        ...state,
        castleLevel: state.castleLevel + 1,
        castleXp: 0,
        gold: state.gold - CASTLE_UPGRADE_COST.gold,
        knowledge: {
            ...state.knowledge,
            force: state.knowledge.force - CASTLE_UPGRADE_COST.force,
            runes: state.knowledge.runes - CASTLE_UPGRADE_COST.runes,
        },
    };
};

export const canClaimDaily = (state: GameState): boolean =>
    state.answersToday >= 5 && !state.dailyClaimed;

export const claimDailyReward = (state: GameState): GameState => {
    if (!canClaimDaily(state)) return state;
    return {
        ...state,
        dailyClaimed: true,
        gold: state.gold + 250,
        keys: state.keys + 1,
    };
};
