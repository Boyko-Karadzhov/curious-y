import { supabase } from '../lib/supabase';
import { ChatMessage, Question } from '../types';
import { GameState, LearningReward } from '../game/economy';
import { learningPayloadFailure, learningRequestFailure, missingGeminiKey } from './learningErrors';
import type { Action, KingdomSnapshot } from '../lib/kingdom/game';

type LearningAction =
  | { action: 'generate'; topic?: string }
  | { action: 'key_status' }
  | { action: 'save_key'; apiKey: string }
  | { action: 'delete_key' }
  | { action: 'validate_key'; apiKey?: string }
  | { action: 'answer'; questionId: string; selectedIndex: number }
  | { action: 'pending_reward' }
  | { action: 'collect_reward'; questionId: string }
  | { action: 'chat'; questionId: string; message: string }
  | { action: 'delete_question'; questionId: string }
  | { action: 'reset'; generation: number }
  | { action: 'kingdom' }
  | { action: 'kingdom_command'; command: Exclude<Action, { type: 'answer' }>; requestId: string; generation: number };

async function invokeLearning<T>(body: LearningAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke('learning', {
    body,
  });
  if (error) throw await learningRequestFailure(error);
  if (data?.error) throw learningPayloadFailure(String(data.error));
  return data as T;
}

const requireGeminiKey = (apiKey: string) => {
  const key = apiKey.trim();
  if (!key) throw missingGeminiKey();
  return key;
};

export const getServerGeminiKeyStatus = async () => {
  const data = await invokeLearning<{ configured: boolean }>({ action: 'key_status' });
  return data.configured;
};

export const saveServerGeminiKey = async (apiKey: string) => {
  const data = await invokeLearning<{ configured: true }>(
    { action: 'save_key', apiKey: requireGeminiKey(apiKey) },
  );
  return data.configured;
};

export const deleteServerGeminiKey = async () => {
  const data = await invokeLearning<{ configured: false }>({ action: 'delete_key' });
  return data.configured;
};

export const testServerGeminiKey = async (apiKey?: string) => {
  await invokeLearning<{ ok: true }>(
    { action: 'validate_key', ...(apiKey?.trim() ? { apiKey: requireGeminiKey(apiKey) } : {}) },
  );
  return { success: true, message: 'Gemini connection verified.' };
};

export const generateServerQuestion = async (topic?: string): Promise<Question> => {
  const data = await invokeLearning<{ question: Question }>({ action: 'generate', topic });
  return data.question;
};

export interface AnswerResult {
  collected: boolean;
  question: Question;
  stats: GameState;
  reward: LearningReward;
  kingdom: KingdomSnapshot;
}

export const submitServerAnswer = (questionId: string, selectedIndex: number) =>
  invokeLearning<AnswerResult>({ action: 'answer', questionId, selectedIndex });

export const getServerPendingReward = async () =>
  (await invokeLearning<{ question: Question | null }>({ action: 'pending_reward' })).question;
export const collectServerReward = async (questionId: string) =>
  (await invokeLearning<{ kingdom: KingdomSnapshot }>({ action: 'collect_reward', questionId })).kingdom;

export const sendServerChatMessage = async (questionId: string, message: string) => {
  const data = await invokeLearning<{ message: ChatMessage }>({ action: 'chat', questionId, message });
  return data.message;
};

export const deleteServerQuestion = (questionId: string) =>
  invokeLearning<{ ok: true }>({ action: 'delete_question', questionId });

export const getServerKingdom = async () => (await invokeLearning<{ kingdom: KingdomSnapshot }>({ action: 'kingdom' })).kingdom;
export const commandServerKingdom = async (command: Exclude<Action, { type: 'answer' }>, generation: number, requestId: string) =>
  (await invokeLearning<{ kingdom: KingdomSnapshot }>({ action: 'kingdom_command', command, generation, requestId })).kingdom;
export const resetServerProgress = async () => {
  const current = await getServerKingdom();
  return invokeLearning<{ stats: GameState; kingdom: KingdomSnapshot }>({ action: 'reset', generation: current.generation });
};
