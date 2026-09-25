import { Question } from '../types';
import balance from '../../supabase/functions/_shared/game-balance.json';

import { KNOWLEDGE_RESOURCES, type LearningReward, type KnowledgeResourceKey, type KnowledgeResourceName } from '../../supabase/functions/_shared/resources';
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
        canonicalConcept: null,
        metadataKnown: false,
        preMastery: 'unseen',
        atomic: false,
        successes: 0,
        axisSuccesses: 0,
        nextDueAt: null,
        reasoning: '',
        boss: false,
        lowValueAttempts: 0,
        answeredAt: new Date().toISOString(),
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
        castleXp: Math.min(balance.demo.castleXpCap, state.castleXp + (reward.correct ? balance.demo.castleXpCorrect : balance.demo.castleXpIncorrect)),
        warPressure: Math.min(balance.demo.warPressureCap, state.warPressure + (reward.correct ? balance.demo.warPressureCorrect : balance.demo.warPressureIncorrect)),
    };
};

export const CASTLE_UPGRADE_COST: Partial<Record<KnowledgeResourceName, number>> & { gold: number } = balance.demo.castleUpgradeCost;

export const canUpgradeCastle = (state: GameState): boolean =>
    KNOWLEDGE_RESOURCES.every(resource => state.knowledge[resource.key] >= (CASTLE_UPGRADE_COST[resource.name] ?? 0)) &&
  state.gold >= CASTLE_UPGRADE_COST.gold;

export const upgradeCastle = (state: GameState): GameState => {
    if (!canUpgradeCastle(state)) {
        return state;
    }

    return {
        ...state,
        castleLevel: state.castleLevel + 1,
        castleXp: 0,
        gold: state.gold - CASTLE_UPGRADE_COST.gold,
        knowledge: Object.fromEntries(KNOWLEDGE_RESOURCES.map(resource => [resource.key,
            state.knowledge[resource.key] - (CASTLE_UPGRADE_COST[resource.name] ?? 0)])) as KnowledgeBalances,
    };
};

export const canClaimDaily = (state: GameState): boolean =>
    state.answersToday >= balance.demo.dailyAnswersRequired && !state.dailyClaimed;

export const claimDailyReward = (state: GameState): GameState => {
    if (!canClaimDaily(state)) {
        return state;
    }

    return {
        ...state,
        dailyClaimed: true,
        gold: state.gold + balance.demo.dailyGold,
        keys: state.keys + balance.demo.dailyKeys,
    };
};
