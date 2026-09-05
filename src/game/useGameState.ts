import { useCallback, useEffect, useState } from 'react';
import {
  applyLearningReward,
  claimDailyReward,
  createInitialGameState,
  GameState,
  LearningReward,
  upgradeCastle,
} from './economy';
import { isSupabaseConfigured } from '../lib/supabase';
import { claimServerDaily, getServerGameStats, upgradeServerCastle } from '../services/backend';

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

const isServerBackedUser = (userId?: string, isDemoUser?: boolean) =>
  Boolean(userId && !isDemoUser && isSupabaseConfigured() && /^[0-9a-f-]{36}$/i.test(userId));

export const useGameState = (userId?: string, isDemoUser = false) => {
  const serverBacked = isServerBackedUser(userId, isDemoUser);
  const [state, setState] = useState<GameState>(() =>
    userId && !serverBacked ? loadState(userId) : createInitialGameState()
  );
  const [latestReward, setLatestReward] = useState<LearningReward | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (!serverBacked) {
      setState(loadState(userId));
      return;
    }
    getServerGameStats().then(setState).catch((error) => {
      console.error('Failed to load server-authoritative stats:', error);
    });
  }, [userId, serverBacked]);

  useEffect(() => {
    if (!userId || serverBacked) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(state));
  }, [state, userId, serverBacked]);

  const award = useCallback((reward: LearningReward) => {
    setState((current) => applyLearningReward(current, reward));
    setLatestReward(reward);
  }, []);

  const upgrade = useCallback(async () => {
    if (!serverBacked) {
      setState((current) => upgradeCastle(current));
      return;
    }
    try {
      const result = await upgradeServerCastle();
      setState(result.stats);
    } catch (error) {
      console.error('Failed to upgrade castle:', error);
    }
  }, [serverBacked]);
  const claimDaily = useCallback(async () => {
    if (!serverBacked) {
      setState((current) => claimDailyReward(current));
      return;
    }
    try {
      const result = await claimServerDaily();
      setState(result.stats);
    } catch (error) {
      console.error('Failed to claim daily reward:', error);
    }
  }, [serverBacked]);
  const clearLatestReward = useCallback(() => setLatestReward(null), []);
  const applyServerResult = useCallback((stats: GameState, reward?: LearningReward) => {
    setState(stats);
    setLatestReward(reward ?? null);
  }, []);
  const reset = useCallback((stats?: GameState) => {
    setState(stats ?? createInitialGameState());
    setLatestReward(null);
  }, []);

  return { state, latestReward, award, applyServerResult, upgrade, claimDaily, clearLatestReward, reset };
};
