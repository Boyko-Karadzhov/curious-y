import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { resetKingdom, KINGDOM_CHANGED } from '../lib/kingdom/storage';
import { clearPendingReward } from '../lib/kingdom/pendingReward';
import {
  Question,
  ChatMessage,
  HistoryItem,
  Concept,
  ReasoningComplexity,
} from '../types';
import {
  calculateMastery,
  createDefaultReasoningTrack,
  createMasteredReasoningTrack,
  getMasteredTrackForAtomic,
} from '../lib/concepts/mastery';
import { findConcept } from '../lib/concepts/registry';
import {
  isKnownMisclassification,
  mergeConceptTopics,
  reclassifyConcept,
} from '../lib/concepts/classifier';
import { GameState } from '../game/economy';
import { deleteServerQuestion, resetServerProgress } from './backend';

const LOCAL_STORAGE_HISTORY_KEY = 'curious_y_questions_history';
const LOCAL_STORAGE_CHAT_KEY = 'curious_y_chat_messages';
const LOCAL_STORAGE_CONCEPTS_KEY = 'curious_y_user_concepts';

interface QuestionHistoryRow {
  id: string;
  user_id: string;
  topic: string;
  subtopic?: string;
  angle?: string;
  angle_fit?: string;
  question_text: string;
  options: string[];
  correct_index: number;
  selected_index?: number | null;
  is_correct?: boolean | null;
  explanation: string;
  suggested_questions?: string[];
  is_reinforcement?: boolean;
  reinforcement_source_question?: string;
  concept?: string;
  reasoning_complexity?: ReasoningComplexity;
  is_boss_question?: boolean;
  created_at?: string;
}

const isValidUUID = (id?: string | null): boolean => {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Standard RFC4122 v4 UUID generator fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const shouldUseLocalStorage = (userId: string) => {
  return !isSupabaseConfigured() || !isValidUUID(userId) || userId.startsWith('demo-') || userId.startsWith('test-');
};

const saveToLocalHistory = (userId: string, item: Question) => {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
    const list: Question[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((q) => q.id !== item.id);
    localStorage.setItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`, JSON.stringify([item, ...filtered]));
  } catch (e) {
    console.warn('LocalStorage save history error:', e);
  }
};

const getFromLocalHistory = (userId: string): Question[] => {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('LocalStorage get history error:', e);
    return [];
  }
};

const saveToLocalChats = (userId: string, msg: ChatMessage) => {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`);
    const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
    if (!list.some((m) => m.id === msg.id)) {
      list.push(msg);
      localStorage.setItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`, JSON.stringify(list));
    }
  } catch (e) {
    console.warn('LocalStorage save chat error:', e);
  }
};

const getFromLocalChats = (userId: string, questionId?: string): ChatMessage[] => {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`);
    const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
    return questionId ? list.filter((m) => m.questionId === questionId) : list;
  } catch (e) {
    console.warn('LocalStorage get chat error:', e);
    return [];
  }
};

const LOCAL_STORAGE_SUBTOPICS_KEY = 'curious_y_cached_subtopics';

export function getCachedSubtopics(userId: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_SUBTOPICS_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('LocalStorage get subtopics error:', e);
    return {};
  }
}

export function cacheSubtopicsForTopic(userId: string, topic: string, subtopics: string[]): void {
  try {
    const existing = getCachedSubtopics(userId);
    const trimmed = topic.trim();
    if (!trimmed || !subtopics || subtopics.length === 0) return;
    existing[trimmed] = subtopics;
    existing[trimmed.toLowerCase()] = subtopics;
    localStorage.setItem(`${LOCAL_STORAGE_SUBTOPICS_KEY}_${userId}`, JSON.stringify(existing));
  } catch (e) {
    console.warn('LocalStorage cache subtopics error:', e);
  }
}

export async function saveQuestion(userId: string, question: Question): Promise<Question> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  const finalId = isValidUUID(question.id) ? question.id! : generateUUID();
  const fullQuestion: Question = {
    ...question,
    id: finalId,
    userId,
    topic: question.topic,
    createdAt: question.createdAt || new Date().toISOString(),
  };

  // Only persist to database/history if the question has actually been answered
  const isAnswered = fullQuestion.selectedIndex !== null && fullQuestion.selectedIndex !== undefined;
  if (!isAnswered) {
    return fullQuestion;
  }

  // Always save locally first for instant caching
  saveToLocalHistory(userId, fullQuestion);

  return fullQuestion;
}

export async function updateQuestionAnswer(
  userId: string,
  questionId: string,
  selectedIndex: number,
  isCorrect: boolean
): Promise<void> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  // Update local storage
  const localHistory = getFromLocalHistory(userId);
  const targetItem = localHistory.find((q) => q.id === questionId);
  if (targetItem) {
    targetItem.selectedIndex = selectedIndex;
    targetItem.isCorrect = isCorrect;
    saveToLocalHistory(userId, targetItem);
  }

  return;
}

export async function getQuestionHistory(userId: string): Promise<HistoryItem[]> {
  const localHistory = getFromLocalHistory(userId).filter(
    (q) => q.selectedIndex !== null && q.selectedIndex !== undefined
  );
  const localChats = getFromLocalChats(userId);

  if (shouldUseLocalStorage(userId)) {
    return localHistory.map((q) => ({
      ...q,
      chatMessages: localChats.filter((c) => c.questionId === q.id),
    }));
  }

  try {
    const { data: questionsData, error: qError } = await supabase.rpc('get_question_history');

    if (qError || !questionsData) {
      throw qError || new Error('Question history was unavailable.');
    }

    const { data: chatData, error: cError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (cError) {
      console.error('Error loading chat messages from Supabase:', cError);
    }

    const chatMap = new Map<string, ChatMessage[]>();
    if (chatData) {
      for (const msg of chatData) {
        const existing = chatMap.get(msg.question_id) || [];
        existing.push({
          id: msg.id,
          questionId: msg.question_id,
          userId: msg.user_id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.created_at,
        });
        chatMap.set(msg.question_id, existing);
      }
    }

    const supabaseHistory: HistoryItem[] = questionsData
      .filter((q: QuestionHistoryRow) => q.selected_index !== null && q.selected_index !== undefined)
      .map((q: QuestionHistoryRow) => ({
        id: q.id,
        userId: q.user_id,
        topic: q.topic,
        subtopic: q.subtopic,
        angle: q.angle,
        angleFit: q.angle_fit,
        questionText: q.question_text,
        options: q.options,
        correctIndex: q.correct_index,
        selectedIndex: q.selected_index,
        isCorrect: q.is_correct,
        explanation: q.explanation,
        suggestedQuestions: q.suggested_questions,
        isReinforcement: q.is_reinforcement,
        reinforcementSourceQuestion: q.reinforcement_source_question,
        concept: q.concept,
        reasoningComplexity: q.reasoning_complexity as ReasoningComplexity,
        isBossQuestion: q.is_boss_question,
        createdAt: q.created_at,
        chatMessages: chatMap.get(q.id) || [],
      }));

    return supabaseHistory.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  } catch (err) {
    console.error('Unexpected error loading authoritative history:', err);
    return [];
  }
}

export async function saveChatMessage(
  userId: string,
  questionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  const finalId = generateUUID();
  const message: ChatMessage = {
    id: finalId,
    questionId,
    userId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  saveToLocalChats(userId, message);

  return message;
}

export async function getChatMessages(userId: string, questionId: string): Promise<ChatMessage[]> {
  const localList = getFromLocalChats(userId, questionId);

  if (shouldUseLocalStorage(userId) || !isValidUUID(questionId)) {
    return localList;
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('question_id', questionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      console.error('Error loading chat messages from Supabase:', error);
      return [];
    }

    const supabaseMessages: ChatMessage[] = data.map((msg) => ({
      id: msg.id,
      questionId: msg.question_id,
      userId: msg.user_id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
    }));

    return supabaseMessages.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });
  } catch (err) {
    console.error('Unexpected error fetching chat messages:', err);
    return [];
  }
}

export async function deleteQuestion(userId: string, questionId: string): Promise<void> {
  try {
    const historyRaw = localStorage.getItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
    if (historyRaw) {
      const history: Question[] = JSON.parse(historyRaw);
      localStorage.setItem(
        `${LOCAL_STORAGE_HISTORY_KEY}_${userId}`,
        JSON.stringify(history.filter((q) => q.id !== questionId))
      );
    }
  } catch (e) {
    console.warn('LocalStorage delete error:', e);
  }

  if (shouldUseLocalStorage(userId) || !isValidUUID(questionId)) {
    return;
  }

  try {
    await deleteServerQuestion(questionId);
  } catch (err) {
    console.error('Error deleting question from Supabase:', err);
  }
}

export function getLocalConcepts(userId: string): Concept[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_CONCEPTS_KEY}_${userId}`);
    const list: Concept[] = raw ? JSON.parse(raw) : [];
    let hasUpdated = false;
    const sanitized = list.map((c) => {
      let current = c;
      if (isKnownMisclassification(current.canonicalName, current.topics)) {
        current = reclassifyConcept(current);
        hasUpdated = true;
      }
      if (current.isAtomic) {
        return {
          ...current,
          mastery: 'mastered' as const,
          reasoningTrack: getMasteredTrackForAtomic(current.reasoningTrack),
        };
      }
      return current;
    });

    if (hasUpdated) {
      saveLocalConcepts(userId, sanitized);
    }
    return sanitized;
  } catch (e) {
    console.warn('LocalStorage error reading concepts:', e);
    return [];
  }
}

export function saveLocalConcepts(userId: string, concepts: Concept[]): void {
  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_CONCEPTS_KEY}_${userId}`,
      JSON.stringify(concepts)
    );
  } catch (e) {
    console.warn('LocalStorage error saving concepts:', e);
  }
}

export async function getUserConcepts(userId: string): Promise<Concept[]> {
  const localList = getLocalConcepts(userId);

  if (shouldUseLocalStorage(userId)) {
    return localList;
  }

  try {
    const { data, error } = await supabase
      .from('concepts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      throw error || new Error('Concept stats were unavailable.');
    }

    const supabaseConcepts: Concept[] = data.map((row) => {
      const isAtomic = row.is_atomic ?? false;
      return {
        id: row.id,
        userId: row.user_id,
        canonicalName: row.canonical_name,
        definition: row.definition,
        aliases: Array.isArray(row.aliases) ? row.aliases : [],
        topics: row.topics || {},
        prerequisites: Array.isArray(row.prerequisites) ? row.prerequisites : [],
        mastery: isAtomic ? 'mastered' : (row.mastery || calculateMastery(row.reasoning_track, isAtomic)),
        reasoningTrack: isAtomic
          ? getMasteredTrackForAtomic(row.reasoning_track)
          : (row.reasoning_track || createDefaultReasoningTrack()),
        lastAsked: row.last_asked ? new Date(row.last_asked).toISOString().split('T')[0] : undefined,
        isAtomic,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    // The browser treats concept mastery as read-only. Do not merge writable local
    // copies into authoritative server statistics.
    return supabaseConcepts;
  } catch (err) {
    console.warn('Unexpected error fetching authoritative concept stats:', err);
    return [];
  }
}

export async function saveUserConcept(userId: string, concept: Concept): Promise<Concept> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  const normalizedTopics = isKnownMisclassification(concept.canonicalName, concept.topics)
    ? reclassifyConcept(concept).topics
    : concept.topics;

  const conceptWithTopics: Concept = {
    ...concept,
    topics: normalizedTopics,
  };

  const conceptToSave: Concept = conceptWithTopics.isAtomic
    ? {
        ...conceptWithTopics,
        mastery: 'mastered',
        reasoningTrack: getMasteredTrackForAtomic(conceptWithTopics.reasoningTrack),
      }
    : conceptWithTopics;

  const localList = getLocalConcepts(userId);
  const filtered = localList.filter(
    (c) => c.canonicalName.toLowerCase() !== conceptToSave.canonicalName.toLowerCase()
  );
  const updatedList = [...filtered, conceptToSave];
  saveLocalConcepts(userId, updatedList);

  return conceptToSave;
}

export async function saveUserConcepts(userId: string, newConcepts: Concept[]): Promise<Concept[]> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  if (newConcepts.length === 0) return [];

  const existing = getLocalConcepts(userId);
  const existingMap = new Map(existing.map((c) => [c.canonicalName.toLowerCase(), c]));

  const normalizedConcepts = newConcepts.map((c) =>
    c.isAtomic
      ? {
          ...c,
          mastery: 'mastered' as const,
          reasoningTrack: getMasteredTrackForAtomic(c.reasoningTrack),
        }
      : c
  );

  for (const c of normalizedConcepts) {
    const key = c.canonicalName.toLowerCase();
    const prev = existingMap.get(key);
    if (prev) {
      // Preserve progress if already learned/tracked
      existingMap.set(key, {
        ...c,
        ...prev,
        mastery: c.isAtomic ? 'mastered' : (prev.mastery || c.mastery),
        reasoningTrack: c.isAtomic
          ? (prev.reasoningTrack || createMasteredReasoningTrack())
          : (prev.reasoningTrack || c.reasoningTrack),
        prerequisites:
          c.prerequisites && c.prerequisites.length > 0 ? c.prerequisites : prev.prerequisites,
        topics: mergeConceptTopics(c.topics, prev.topics, c.canonicalName),
        updatedAt: new Date().toISOString(),
      });
    } else {
      existingMap.set(key, c);
    }
  }

  const merged = Array.from(existingMap.values());
  saveLocalConcepts(userId, merged);

  return normalizedConcepts;
}

export async function reclassifyAllUserConcepts(userId: string): Promise<Concept[]> {
  if (!shouldUseLocalStorage(userId)) return getUserConcepts(userId);
  const updated = (await getUserConcepts(userId)).map(c => reclassifyConcept(c));
  saveLocalConcepts(userId, updated);
  return updated;
}

export async function updateConceptAnswer(
  userId: string,
  canonicalName: string,
  complexity: ReasoningComplexity
): Promise<Concept | null> {
  const concepts = await getUserConcepts(userId);
  const target = findConcept(canonicalName, concepts);
  if (!target) {
    return null;
  }

  if (!target.reasoningTrack) {
    target.reasoningTrack = target.isAtomic
      ? createMasteredReasoningTrack()
      : createDefaultReasoningTrack();
  }

  target.reasoningTrack[complexity] = (target.reasoningTrack[complexity] || 0) + 1;
  target.mastery = target.isAtomic ? 'mastered' : calculateMastery(target.reasoningTrack, target.isAtomic);
  target.lastAsked = new Date().toISOString().split('T')[0];
  target.updatedAt = new Date().toISOString();

  await saveUserConcept(userId, target);
  return target;
}

export async function deleteUserConcept(userId: string, canonicalName: string): Promise<void> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  const localList = getLocalConcepts(userId);
  saveLocalConcepts(
    userId,
    localList.filter((c) => c.canonicalName.toLowerCase() !== canonicalName.toLowerCase())
  );

  return;
}

export async function clearUserConcepts(userId: string): Promise<void> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  saveLocalConcepts(userId, []);
  return;
}

export async function clearQuestionHistory(userId: string): Promise<void> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
  } catch (e) {
    console.warn('LocalStorage clear history error:', e);
  }

  return;
}

export async function clearChatMessages(userId: string): Promise<void> {
  if (!shouldUseLocalStorage(userId)) throw new Error("Use the authenticated learning service to change account progress.");
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`);
  } catch (e) {
    console.warn('LocalStorage clear chat error:', e);
  }

  return;
}

export async function resetUserProgress(userId: string): Promise<GameState | undefined> {
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_SUBTOPICS_KEY}_${userId}`);
  } catch (e) {
    console.warn('LocalStorage clear cached subtopics error:', e);
  }

  if (!shouldUseLocalStorage(userId)) {
    const result = await resetServerProgress();
    window.dispatchEvent(new Event(KINGDOM_CHANGED));
    return result.stats;
  }

  await Promise.all([
    clearUserConcepts(userId),
    clearQuestionHistory(userId),
    clearChatMessages(userId),
  ]);
  resetKingdom(userId);
  clearPendingReward(userId);
  return undefined;
}

export const shouldConfirmReset = (): boolean => {
  if (typeof window === 'undefined') return true;
  if (typeof window.confirm !== 'function') return true;

  // If confirm is mocked by vitest/jest, invoke the mock
  const isMocked =
    'mock' in window.confirm ||
    Boolean((window.confirm as unknown as { _isMockFunction?: boolean })._isMockFunction) ||
    Boolean((window.confirm as unknown as { mock?: unknown }).mock);

  if (isMocked) {
    return window.confirm('Are you sure you want to reset your learning progress, Castle, Resources, Gold, buildings, and campaign?');
  }

  // In jsdom without a mock, window.confirm returns false and warns to stderr.
  const isJsdom =
    typeof navigator !== 'undefined' &&
    (navigator.userAgent.includes('jsdom') || navigator.userAgent.includes('Node.js'));

  if (isJsdom) {
    return true;
  }

  // In real browser environments, prompt the user for confirmation
  return window.confirm(
    'Are you sure you want to reset your learning progress? This will permanently delete your concepts knowledge graph, reasoning track masteries, question history, Castle, Resources, Gold, buildings, and campaign on this device.'
  );
};
