import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserSettings, Question, ChatMessage, HistoryItem, DEFAULT_TOPICS, LLMProvider } from '../types';

const LOCAL_STORAGE_SETTINGS_KEY = 'curious_y_user_settings';
const LOCAL_STORAGE_HISTORY_KEY = 'curious_y_questions_history';
const LOCAL_STORAGE_CHAT_KEY = 'curious_y_chat_messages';
const LOCAL_STORAGE_KEY_PREFIX = 'curious_y_api_key';

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
  return !isSupabaseConfigured() || userId.startsWith('demo-') || userId.startsWith('test-');
};

export const getSavedApiKey = (userId: string, provider: LLMProvider): string => {
  try {
    return localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}_${provider}_${userId}`) || '';
  } catch (e) {
    console.warn('LocalStorage error getting provider key:', e);
    return '';
  }
};

export const saveApiKeyForProvider = (userId: string, provider: LLMProvider, key: string): void => {
  try {
    if (key && key.trim()) {
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_${provider}_${userId}`, key.trim());
    }
  } catch (e) {
    console.warn('LocalStorage error saving provider key:', e);
  }
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

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const defaultSettings: UserSettings = {
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    apiKey: '',
    topics: DEFAULT_TOPICS,
  };

  // Check local cache first
  let localSettings: UserSettings | null = null;
  try {
    const stored = localStorage.getItem(`${LOCAL_STORAGE_SETTINGS_KEY}_${userId}`);
    if (stored) {
      localSettings = { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('LocalStorage error reading settings:', e);
  }

  if (shouldUseLocalStorage(userId)) {
    return localSettings || defaultSettings;
  }

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user settings from Supabase, using local cache:', error);
      return localSettings || defaultSettings;
    }

    if (!data) {
      // Row doesn't exist yet, insert initial settings
      const initialKey = localSettings?.apiKey || getSavedApiKey(userId, 'gemini') || '';
      const { data: created } = await supabase
        .from('user_settings')
        .insert({
          id: userId,
          provider: localSettings?.provider || 'gemini',
          model: localSettings?.model || 'gemini-3.7-flash',
          api_key: initialKey,
          topics: localSettings?.topics || DEFAULT_TOPICS,
        })
        .select()
        .maybeSingle();

      const res: UserSettings = {
        id: created?.id || userId,
        provider: (created?.provider as LLMProvider) || localSettings?.provider || 'gemini',
        model: created?.model || localSettings?.model || 'gemini-3.7-flash',
        apiKey: created?.api_key || initialKey,
        topics: created?.topics || localSettings?.topics || DEFAULT_TOPICS,
        updatedAt: created?.updated_at,
      };

      try {
        localStorage.setItem(`${LOCAL_STORAGE_SETTINGS_KEY}_${userId}`, JSON.stringify(res));
      } catch (e) {
        console.warn('LocalStorage write error:', e);
      }
      return res;
    }

    // Determine the most reliable API key
    let finalApiKey = data.api_key || '';
    if (!finalApiKey && localSettings?.apiKey) {
      finalApiKey = localSettings.apiKey;
    }
    if (!finalApiKey) {
      finalApiKey = getSavedApiKey(userId, data.provider as LLMProvider);
    }

    const mergedSettings: UserSettings = {
      id: data.id,
      provider: (data.provider as LLMProvider) || 'gemini',
      model: data.model || 'gemini-3.7-flash',
      apiKey: finalApiKey,
      topics: data.topics || DEFAULT_TOPICS,
      updatedAt: data.updated_at,
    };

    // Cache to localStorage
    try {
      localStorage.setItem(`${LOCAL_STORAGE_SETTINGS_KEY}_${userId}`, JSON.stringify(mergedSettings));
      if (finalApiKey) {
        saveApiKeyForProvider(userId, mergedSettings.provider, finalApiKey);
      }
    } catch (e) {
      console.warn('LocalStorage write error:', e);
    }

    return mergedSettings;
  } catch (err) {
    console.error('Unexpected error fetching user settings:', err);
    return localSettings || defaultSettings;
  }
}

export async function saveUserSettings(userId: string, settings: UserSettings): Promise<UserSettings> {
  // Always persist to localStorage immediately
  try {
    localStorage.setItem(`${LOCAL_STORAGE_SETTINGS_KEY}_${userId}`, JSON.stringify(settings));
    if (settings.apiKey) {
      saveApiKeyForProvider(userId, settings.provider, settings.apiKey);
    }
  } catch (e) {
    console.warn('LocalStorage write error:', e);
  }

  if (shouldUseLocalStorage(userId)) {
    return settings;
  }

  try {
    // 1. Try explicit update first (since user_settings usually already exists)
    const { data: updateData, error: updateError } = await supabase
      .from('user_settings')
      .update({
        provider: settings.provider,
        model: settings.model,
        api_key: settings.apiKey,
        topics: settings.topics,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (!updateError && updateData) {
      return {
        id: updateData.id,
        provider: updateData.provider as LLMProvider,
        model: updateData.model,
        apiKey: updateData.api_key || '',
        topics: updateData.topics || DEFAULT_TOPICS,
        updatedAt: updateData.updated_at,
      };
    }

    // 2. If row was not found to update, attempt upsert with onConflict
    const { data: upsertData, error: upsertError } = await supabase
      .from('user_settings')
      .upsert(
        {
          id: userId,
          provider: settings.provider,
          model: settings.model,
          api_key: settings.apiKey,
          topics: settings.topics,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .maybeSingle();

    if (upsertError) {
      console.error('Error saving user settings to Supabase, local cache retained:', upsertError);
      return settings;
    }

    return {
      id: upsertData?.id || userId,
      provider: (upsertData?.provider as LLMProvider) || settings.provider,
      model: upsertData?.model || settings.model,
      apiKey: upsertData?.api_key || settings.apiKey,
      topics: upsertData?.topics || settings.topics,
      updatedAt: upsertData?.updated_at,
    };
  } catch (err) {
    console.error('Unexpected error saving user settings:', err);
    return settings;
  }
}

export async function saveQuestion(userId: string, question: Question): Promise<Question> {
  const finalId = isValidUUID(question.id) ? question.id! : generateUUID();
  const fullQuestion: Question = {
    ...question,
    id: finalId,
    userId,
    createdAt: question.createdAt || new Date().toISOString(),
  };

  // Only persist to database/history if the question has actually been answered
  const isAnswered = fullQuestion.selectedIndex !== null && fullQuestion.selectedIndex !== undefined;
  if (!isAnswered) {
    return fullQuestion;
  }

  // Always save locally first for instant caching
  saveToLocalHistory(userId, fullQuestion);

  if (shouldUseLocalStorage(userId)) {
    return fullQuestion;
  }

  try {
    const insertPayload: Record<string, unknown> = {
      id: fullQuestion.id,
      user_id: userId,
      topic: fullQuestion.topic,
      question_text: fullQuestion.questionText,
      options: fullQuestion.options,
      correct_index: fullQuestion.correctIndex,
      selected_index: fullQuestion.selectedIndex,
      is_correct: fullQuestion.isCorrect,
      explanation: fullQuestion.explanation,
    };

    const { data, error } = await supabase
      .from('questions')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('Error saving question to Supabase, local cache retained:', error);
      return fullQuestion;
    }

    const saved: Question = {
      id: data.id,
      userId: data.user_id,
      topic: data.topic,
      questionText: data.question_text,
      options: data.options,
      correctIndex: data.correct_index,
      selectedIndex: data.selected_index,
      isCorrect: data.is_correct,
      explanation: data.explanation,
      createdAt: data.created_at,
    };

    saveToLocalHistory(userId, saved);
    return saved;
  } catch (err) {
    console.error('Unexpected error saving question:', err);
    return fullQuestion;
  }
}

export async function updateQuestionAnswer(
  userId: string,
  questionId: string,
  selectedIndex: number,
  isCorrect: boolean
): Promise<void> {
  // Update local storage
  const localHistory = getFromLocalHistory(userId);
  const targetItem = localHistory.find((q) => q.id === questionId);
  if (targetItem) {
    targetItem.selectedIndex = selectedIndex;
    targetItem.isCorrect = isCorrect;
    saveToLocalHistory(userId, targetItem);
  }

  if (shouldUseLocalStorage(userId)) {
    return;
  }

  try {
    if (isValidUUID(questionId)) {
      const { data, error } = await supabase
        .from('questions')
        .update({
          selected_index: selectedIndex,
          is_correct: isCorrect,
        })
        .eq('id', questionId)
        .eq('user_id', userId)
        .select();

      // If the row was not found in Supabase (e.g. initial insert failed), insert the full question now
      if (!error && (!data || data.length === 0) && targetItem) {
        await supabase.from('questions').insert({
          id: targetItem.id,
          user_id: userId,
          topic: targetItem.topic,
          question_text: targetItem.questionText,
          options: targetItem.options,
          correct_index: targetItem.correctIndex,
          selected_index: selectedIndex,
          is_correct: isCorrect,
          explanation: targetItem.explanation,
        });
      }

      if (error) {
        console.error('Error updating question answer in Supabase:', error);
      }
    }
  } catch (err) {
    console.error('Unexpected error updating question answer:', err);
  }
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
    const { data: questionsData, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('user_id', userId)
      .not('selected_index', 'is', null)
      .order('created_at', { ascending: false });

    if (qError || !questionsData) {
      console.error('Error loading questions from Supabase, using local cache:', qError);
      return localHistory.map((q) => ({
        ...q,
        chatMessages: localChats.filter((c) => c.questionId === q.id),
      }));
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
      .filter((q) => q.selected_index !== null && q.selected_index !== undefined)
      .map((q) => ({
        id: q.id,
        userId: q.user_id,
        topic: q.topic,
        questionText: q.question_text,
        options: q.options,
        correctIndex: q.correct_index,
        selectedIndex: q.selected_index,
        isCorrect: q.is_correct,
        explanation: q.explanation,
        createdAt: q.created_at,
        chatMessages: chatMap.get(q.id) || localChats.filter((c) => c.questionId === q.id),
      }));

    // Merge any locally answered questions that might not have synced yet
    const idSet = new Set(supabaseHistory.map((item) => item.id));
    for (const localItem of localHistory) {
      if (!idSet.has(localItem.id)) {
        supabaseHistory.push({
          ...localItem,
          chatMessages: localChats.filter((c) => c.questionId === localItem.id),
        });
      }
    }

    return supabaseHistory.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  } catch (err) {
    console.error('Unexpected error loading history, falling back to local cache:', err);
    return localHistory.map((q) => ({
      ...q,
      chatMessages: localChats.filter((c) => c.questionId === q.id),
    }));
  }
}

export async function saveChatMessage(
  userId: string,
  questionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage> {
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

  if (shouldUseLocalStorage(userId)) {
    return message;
  }

  try {
    const insertPayload: Record<string, unknown> = {
      id: message.id,
      user_id: userId,
      role: message.role,
      content: message.content,
    };

    if (isValidUUID(questionId)) {
      insertPayload.question_id = questionId;
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('Error saving chat message to Supabase:', error);
      return message;
    }

    return {
      id: data.id,
      questionId: data.question_id,
      userId: data.user_id,
      role: data.role,
      content: data.content,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.error('Unexpected error saving chat message:', err);
    return message;
  }
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
      return localList;
    }

    const supabaseMessages: ChatMessage[] = data.map((msg) => ({
      id: msg.id,
      questionId: msg.question_id,
      userId: msg.user_id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
    }));

    const idSet = new Set(supabaseMessages.map((m) => m.id));
    for (const lMsg of localList) {
      if (!idSet.has(lMsg.id)) {
        supabaseMessages.push(lMsg);
      }
    }

    return supabaseMessages.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });
  } catch (err) {
    console.error('Unexpected error fetching chat messages:', err);
    return localList;
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
    await supabase.from('questions').delete().eq('id', questionId).eq('user_id', userId);
  } catch (err) {
    console.error('Error deleting question from Supabase:', err);
  }
}
