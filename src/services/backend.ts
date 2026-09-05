import { supabase } from '../lib/supabase';
import { ChatMessage, Question } from '../types';
import { GameState, LearningReward } from '../game/economy';

type LearningAction =
  | { action: 'generate'; topic?: string }
  | { action: 'key_status' }
  | { action: 'save_key' }
  | { action: 'delete_key' }
  | { action: 'validate_key' }
  | { action: 'answer'; questionId: string; selectedIndex: number }
  | { action: 'chat'; questionId: string; message: string }
  | { action: 'delete_question'; questionId: string }
  | { action: 'reset' }
  | { action: 'upgrade' }
  | { action: 'claim_daily' };

async function invokeLearning<T>(body: LearningAction, geminiApiKey?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('learning', {
    body,
    ...(geminiApiKey ? { headers: { 'x-gemini-api-key': geminiApiKey } } : {}),
  });
  if (error) throw new Error(error.message || 'The learning backend request failed.');
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

const requireGeminiKey = (apiKey: string) => {
  const key = apiKey.trim();
  if (!key) throw new Error('Add your Gemini API key in Settings first.');
  return key;
};

export const getServerGeminiKeyStatus = async () => {
  const data = await invokeLearning<{ configured: boolean }>({ action: 'key_status' });
  return data.configured;
};

export const saveServerGeminiKey = async (apiKey: string) => {
  const data = await invokeLearning<{ configured: true }>(
    { action: 'save_key' },
    requireGeminiKey(apiKey),
  );
  return data.configured;
};

export const deleteServerGeminiKey = async () => {
  const data = await invokeLearning<{ configured: false }>({ action: 'delete_key' });
  return data.configured;
};

export const testServerGeminiKey = async (apiKey?: string) => {
  await invokeLearning<{ ok: true }>(
    { action: 'validate_key' },
    apiKey?.trim() ? requireGeminiKey(apiKey) : undefined,
  );
  return { success: true, message: 'Gemini connection verified.' };
};

export const generateServerQuestion = async (topic?: string): Promise<Question> => {
  const data = await invokeLearning<{ question: Question }>({ action: 'generate', topic });
  return data.question;
};

export interface AnswerResult {
  question: Question;
  stats: GameState;
  reward: LearningReward;
}

export const submitServerAnswer = (questionId: string, selectedIndex: number) =>
  invokeLearning<AnswerResult>({ action: 'answer', questionId, selectedIndex });

export const sendServerChatMessage = async (questionId: string, message: string) => {
  const data = await invokeLearning<{ message: ChatMessage }>({ action: 'chat', questionId, message });
  return data.message;
};

export const deleteServerQuestion = (questionId: string) =>
  invokeLearning<{ ok: true }>({ action: 'delete_question', questionId });

export const resetServerProgress = () =>
  invokeLearning<{ stats: GameState }>({ action: 'reset' });

export const upgradeServerCastle = () =>
  invokeLearning<{ stats: GameState }>({ action: 'upgrade' });

export const claimServerDaily = () =>
  invokeLearning<{ stats: GameState }>({ action: 'claim_daily' });

export const getServerGameStats = async (): Promise<GameState> => {
  const { data, error } = await supabase.from('game_stats').select('*').single();
  if (error || !data) throw new Error(error?.message || 'Stats not found.');
  return {
    dayStamp: data.day_stamp,
    castleLevel: data.castle_level,
    castleXp: data.castle_xp,
    gold: data.gold,
    gems: data.gems,
    keys: data.keys,
    knowledge: data.knowledge,
    answersToday: data.answers_today,
    correctToday: data.correct_today,
    dailyClaimed: data.daily_claimed,
    streak: data.streak,
    trophies: data.trophies,
    warPressure: Number(data.war_pressure),
  };
};
