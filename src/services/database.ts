import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserSettings, Question, ChatMessage, HistoryItem, DEFAULT_TOPICS } from '../types';

const LOCAL_STORAGE_SETTINGS_KEY = 'curious_y_user_settings';
const LOCAL_STORAGE_HISTORY_KEY = 'curious_y_questions_history';
const LOCAL_STORAGE_CHAT_KEY = 'curious_y_chat_messages';

const shouldUseLocalStorage = (userId: string) => {
  return !isSupabaseConfigured() || userId.startsWith('demo-') || userId.startsWith('test-');
};

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const defaultSettings: UserSettings = {
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    apiKey: '',
    topics: DEFAULT_TOPICS,
  };

  if (shouldUseLocalStorage(userId)) {
    try {
      const stored = localStorage.getItem(`${LOCAL_STORAGE_SETTINGS_KEY}_${userId}`);
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('LocalStorage error reading settings:', e);
    }
    return defaultSettings;
  }

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user settings from Supabase:', error);
      return defaultSettings;
    }

    if (!data) {
      // Create initial settings row
      const { data: created, error: insertError } = await supabase
        .from('user_settings')
        .insert({
          id: userId,
          provider: 'gemini',
          model: 'gemini-3.7-flash',
          api_key: '',
          topics: DEFAULT_TOPICS,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating user settings in Supabase:', insertError);
        return defaultSettings;
      }

      return {
        id: created.id,
        provider: created.provider,
        model: created.model,
        apiKey: created.api_key || '',
        topics: created.topics || DEFAULT_TOPICS,
        updatedAt: created.updated_at,
      };
    }

    return {
      id: data.id,
      provider: data.provider,
      model: data.model,
      apiKey: data.api_key || '',
      topics: data.topics || DEFAULT_TOPICS,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error('Unexpected error fetching user settings:', err);
    return defaultSettings;
  }
}

export async function saveUserSettings(userId: string, settings: UserSettings): Promise<UserSettings> {
  // Always update local storage for instant access / offline fallback
  try {
    localStorage.setItem(`${LOCAL_STORAGE_SETTINGS_KEY}_${userId}`, JSON.stringify(settings));
  } catch (e) {
    console.warn('LocalStorage write error:', e);
  }

  if (shouldUseLocalStorage(userId)) {
    return settings;
  }

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .upsert({
        id: userId,
        provider: settings.provider,
        model: settings.model,
        api_key: settings.apiKey,
        topics: settings.topics,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving user settings to Supabase:', error);
      return settings;
    }

    return {
      id: data.id,
      provider: data.provider,
      model: data.model,
      apiKey: data.api_key || '',
      topics: data.topics || DEFAULT_TOPICS,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error('Unexpected error saving user settings:', err);
    return settings;
  }
}

export async function saveQuestion(userId: string, question: Question): Promise<Question> {
  const generatedId = question.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const fullQuestion: Question = {
    ...question,
    id: generatedId,
    userId,
    createdAt: question.createdAt || new Date().toISOString(),
  };

  if (shouldUseLocalStorage(userId)) {
    try {
      const historyRaw = localStorage.getItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
      const history: Question[] = historyRaw ? JSON.parse(historyRaw) : [];
      const updated = [fullQuestion, ...history.filter((q) => q.id !== fullQuestion.id)];
      localStorage.setItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('LocalStorage history write error:', e);
    }
    return fullQuestion;
  }

  try {
    const { data, error } = await supabase
      .from('questions')
      .insert({
        id: fullQuestion.id,
        user_id: userId,
        topic: fullQuestion.topic,
        question_text: fullQuestion.questionText,
        options: fullQuestion.options,
        correct_index: fullQuestion.correctIndex,
        selected_index: fullQuestion.selectedIndex ?? null,
        is_correct: fullQuestion.isCorrect ?? null,
        explanation: fullQuestion.explanation,
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving question to Supabase:', error);
      return fullQuestion;
    }

    return {
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
  if (shouldUseLocalStorage(userId)) {
    try {
      const historyRaw = localStorage.getItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
      if (historyRaw) {
        const history: Question[] = JSON.parse(historyRaw);
        const index = history.findIndex((q) => q.id === questionId);
        if (index !== -1) {
          history[index].selectedIndex = selectedIndex;
          history[index].isCorrect = isCorrect;
          localStorage.setItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`, JSON.stringify(history));
        }
      }
    } catch (e) {
      console.warn('LocalStorage update error:', e);
    }
    return;
  }

  try {
    const { error } = await supabase
      .from('questions')
      .update({
        selected_index: selectedIndex,
        is_correct: isCorrect,
      })
      .eq('id', questionId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating question answer in Supabase:', error);
    }
  } catch (err) {
    console.error('Unexpected error updating question answer:', err);
  }
}

export async function getQuestionHistory(userId: string): Promise<HistoryItem[]> {
  if (shouldUseLocalStorage(userId)) {
    try {
      const historyRaw = localStorage.getItem(`${LOCAL_STORAGE_HISTORY_KEY}_${userId}`);
      const history: Question[] = historyRaw ? JSON.parse(historyRaw) : [];
      const chatsRaw = localStorage.getItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`);
      const chats: ChatMessage[] = chatsRaw ? JSON.parse(chatsRaw) : [];

      return history.map((q) => ({
        ...q,
        chatMessages: chats.filter((c) => c.questionId === q.id),
      }));
    } catch (e) {
      console.warn('LocalStorage error reading history:', e);
      return [];
    }
  }

  try {
    const { data: questionsData, error: qError } = await supabase
      .from('questions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (qError) {
      console.error('Error loading questions from Supabase:', qError);
      return [];
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

    return (questionsData || []).map((q) => ({
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
      chatMessages: chatMap.get(q.id) || [],
    }));
  } catch (err) {
    console.error('Unexpected error loading history:', err);
    return [];
  }
}

export async function saveChatMessage(
  userId: string,
  questionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage> {
  const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const message: ChatMessage = {
    id: generatedId,
    questionId,
    userId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  if (shouldUseLocalStorage(userId)) {
    try {
      const chatsRaw = localStorage.getItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`);
      const chats: ChatMessage[] = chatsRaw ? JSON.parse(chatsRaw) : [];
      chats.push(message);
      localStorage.setItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`, JSON.stringify(chats));
    } catch (e) {
      console.warn('LocalStorage chat write error:', e);
    }
    return message;
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        id: message.id,
        question_id: questionId,
        user_id: userId,
        role: message.role,
        content: message.content,
      })
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
  if (shouldUseLocalStorage(userId)) {
    try {
      const chatsRaw = localStorage.getItem(`${LOCAL_STORAGE_CHAT_KEY}_${userId}`);
      const chats: ChatMessage[] = chatsRaw ? JSON.parse(chatsRaw) : [];
      return chats.filter((c) => c.questionId === questionId);
    } catch (e) {
      console.warn('LocalStorage error reading chat messages:', e);
      return [];
    }
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('question_id', questionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading chat messages from Supabase:', error);
      return [];
    }

    return (data || []).map((msg) => ({
      id: msg.id,
      questionId: msg.question_id,
      userId: msg.user_id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
    }));
  } catch (err) {
    console.error('Unexpected error fetching chat messages:', err);
    return [];
  }
}

export async function deleteQuestion(userId: string, questionId: string): Promise<void> {
  if (shouldUseLocalStorage(userId)) {
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
    return;
  }

  try {
    await supabase.from('questions').delete().eq('id', questionId).eq('user_id', userId);
  } catch (err) {
    console.error('Error deleting question:', err);
  }
}
