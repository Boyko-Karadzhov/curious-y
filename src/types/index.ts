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
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Next-gen frontier speed, high intelligence & rich reasoning',
      recommended: true,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      description: 'Advanced reasoning, complex STEM mathematics & deep analysis',
    },
    {
      id: 'gemini-2.5-flash-lite',
      name: 'Gemini 2.5 Flash-Lite',
      description: 'Ultra-fast, cost-efficient model for rapid microlearning',
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      description: 'High-speed agentic reasoning model',
    },
    {
      id: 'gemini-2.0-flash-lite',
      name: 'Gemini 2.0 Flash-Lite',
      description: 'Fast and lightweight for high-volume quizzes',
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Omni)',
      description: 'Flagship model with versatile intelligence & math capabilities',
      recommended: true,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Fast, lightweight model for everyday microlearning',
    },
    {
      id: 'o3-mini',
      name: 'o3-mini',
      description: 'Deep reasoning model specialized in STEM, math, and science',
    },
    {
      id: 'o3',
      name: 'o3',
      description: 'Frontier reasoning model for complex thinking & deductions',
    },
    {
      id: 'o1',
      name: 'o1',
      description: 'Deep reasoning model for rigorous step-by-step logic',
    },
  ],
  anthropic: [
    {
      id: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      description: 'State-of-the-art hybrid reasoning & leading STEM intelligence',
      recommended: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'High intelligence, rapid responses & precise explanations',
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      description: 'Lightning-fast and cost-effective microlearning',
    },
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      description: 'Deep analytical intelligence for nuanced topics',
    },
  ],
};
