export type LLMProvider = 'openai' | 'anthropic' | 'gemini';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
}

export interface UserSettings {
  id?: string;
  provider: LLMProvider;
  model: string;
  apiKey: string;
  topics: string;
  updatedAt?: string;
}

export interface Question {
  id?: string;
  userId?: string;
  topic: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  selectedIndex?: number | null;
  isCorrect?: boolean | null;
  explanation: string;
  createdAt?: string;
}

export interface ChatMessage {
  id?: string;
  questionId?: string;
  userId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

export interface HistoryItem extends Question {
  chatMessages?: ChatMessage[];
}

export const DEFAULT_TOPICS = 'Physics, Chemistry, Algebra, Calculus, History';

export const PROVIDER_MODELS: Record<LLMProvider, ModelOption[]> = {
  gemini: [
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      description: 'Ultra-fast, state of the art multimodality and reasoning',
      recommended: true,
    },
    {
      id: 'gemini-2.0-flash-lite',
      name: 'Gemini 2.0 Flash-Lite',
      description: 'Cost-efficient and fast for high throughput',
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      description: 'Complex reasoning, math, and deep explanations',
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      description: 'Fast, lightweight and general purpose',
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Omni)',
      description: 'Flagship model, high intelligence and math capabilities',
      recommended: true,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Fast and lightweight for everyday tasks',
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      description: 'Reasoning model focused on STEM and science',
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      description: 'High capability model with wide knowledge',
    },
  ],
  anthropic: [
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      description: 'Hybrid reasoning and leading coding/STEM intelligence',
      recommended: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'High intelligence and fast responses',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      description: 'Ultra-fast and cost-efficient',
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      description: 'Deep analytical intelligence',
    },
  ],
};
