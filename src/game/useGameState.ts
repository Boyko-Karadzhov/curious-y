import { useCallback, useEffect, useState } from 'react';
import {
  applyLearningReward,
  claimDailyReward,
  createInitialGameState,
  GameState,
  LearningReward,
  upgradeCastle,
} from './economy';

const STORAGE_KEY = 'curious_y_kingdom_v1';

const loadState = (userId: string): GameState => {
  try {
    const initial = createInitialGameState();
    const saved = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (!saved) return initial;

    const parsed = JSON.parse(saved) as Partial<GameState>;
    const merged: GameState = {
      ...initial,
      ...parsed,
      knowledge: { ...initial.knowledge, ...parsed.knowledge },
    };

    if (merged.dayStamp !== initial.dayStamp) {
      return {
        ...merged,
        dayStamp: initial.dayStamp,
        answersToday: 0,
        correctToday: 0,
        dailyClaimed: false,
      };
    }

    return merged;
  } catch {
    return createInitialGameState();
  }
};

export const useGameState = (userId?: string) => {
  const [state, setState] = useState<GameState>(() =>
    userId ? loadState(userId) : createInitialGameState()
  );
  const [latestReward, setLatestReward] = useState<LearningReward | null>(null);

  useEffect(() => {
    if (userId) setState(loadState(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(state));
  }, [state, userId]);

  const award = useCallback((reward: LearningReward) => {
    setState((current) => applyLearningReward(current, reward));
    setLatestReward(reward);
  }, []);

  const upgrade = useCallback(() => setState((current) => upgradeCastle(current)), []);
  const claimDaily = useCallback(() => setState((current) => claimDailyReward(current)), []);
  const clearLatestReward = useCallback(() => setLatestReward(null), []);
  const reset = useCallback(() => {
    setState(createInitialGameState());
    setLatestReward(null);
  }, []);

  return { state, latestReward, award, upgrade, claimDaily, clearLatestReward, reset };
};
