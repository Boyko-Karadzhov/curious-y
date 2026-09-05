import { describe, expect, it } from 'vitest';
import {
  applyLearningReward,
  calculateLearningReward,
  canClaimDaily,
  canUpgradeCastle,
  claimDailyReward,
  createInitialGameState,
  upgradeCastle,
} from '../game/economy';
import { Question } from '../types';

const question: Question = {
  topic: 'Physics',
  questionText: 'Why?',
  options: ['A', 'B', 'C', 'D'],
  correctIndex: 0,
  explanation: 'Because.',
  reasoningComplexity: 'derivation',
};

describe('kingdom economy', () => {
  it('distributes learning value using concept topic weights', () => {
    const reward = calculateLearningReward(question, true, {
      Physics: 0.7,
      'Mathematics & Logic': 0.2,
      'Earth & Space': 0.1,
    });

    expect(reward.totalKnowledge).toBe(35);
    expect(reward.lines).toEqual([
      { key: 'force', amount: 25 },
      { key: 'runes', amount: 7 },
      { key: 'astral', amount: 4 },
    ]);
  });

  it('gives a small recovery reward for an incorrect answer', () => {
    const reward = calculateLearningReward(question, false);
    expect(reward.correct).toBe(false);
    expect(reward.totalKnowledge).toBeGreaterThanOrEqual(3);
    expect(reward.gold).toBe(8);
  });

  it('persists rewards into the resource balances and daily progress', () => {
    const state = createInitialGameState();
    const reward = calculateLearningReward(question, true);
    const next = applyLearningReward(state, reward);

    expect(next.knowledge.force).toBeGreaterThan(state.knowledge.force);
    expect(next.answersToday).toBe(state.answersToday + 1);
    expect(next.warPressure).toBeGreaterThan(state.warPressure);
  });

  it('spends materials on a castle upgrade only when affordable', () => {
    const state = createInitialGameState();
    expect(canUpgradeCastle(state)).toBe(false);

    const richState = {
      ...state,
      gold: 500,
      knowledge: { ...state.knowledge, force: 100, runes: 75 },
    };
    expect(canUpgradeCastle(richState)).toBe(true);
    expect(upgradeCastle(richState).castleLevel).toBe(2);
  });

  it('claims the daily chest once five answers are completed', () => {
    const state = { ...createInitialGameState(), answersToday: 5 };
    expect(canClaimDaily(state)).toBe(true);
    const claimed = claimDailyReward(state);
    expect(claimed.dailyClaimed).toBe(true);
    expect(claimed.keys).toBe(state.keys + 1);
    expect(canClaimDaily(claimed)).toBe(false);
  });
});
