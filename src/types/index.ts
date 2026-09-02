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
  updatedAt?: string;
}

export interface WrongQuestionContext {
  questionText: string;
  explanation: string;
  topic: string;
  subtopic?: string;
  angle?: string;
  userSelectedOption?: string;
  correctOption?: string;
}

export interface Question {
  id?: string;
  userId?: string;
  topic: string;
  subtopic?: string;
  angle?: string;
  angleFit?: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  selectedIndex?: number | null;
  isCorrect?: boolean | null;
  explanation: string;
  suggestedQuestions?: string[];
  isReinforcement?: boolean;
  reinforcementSourceQuestion?: string;
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

export const TOPICS = [
  'Physics',
  'Mathematics & Logic',
  'Chemistry',
  'Life',
  'Computer Science',
  'Earth & Space',
  'Mind & Behavior',
  'Society & History',
] as const;

export type TopicName = (typeof TOPICS)[number];

export const PROVIDER_MODELS: Record<LLMProvider, ModelOption[]> = {
  gemini: [
    {
      id: 'gemini-3.5-flash-lite',
      name: 'Gemini 3.5 Flash-Lite',
      description: 'Ultra-fast, cost-efficient frontier model for high-throughput learning',
      recommended: true,
    },
    {
      id: 'gemini-3.7-flash',
      name: 'Gemini 3.7 Flash',
      description: 'Latest frontier workhorse for agentic reasoning, STEM & speed',
    },
    {
      id: 'gemini-3.6-flash',
      name: 'Gemini 3.6 Flash',
      description: 'High-performance everyday reasoning and rapid quizzes',
    },
    {
      id: 'gemini-3.1-pro',
      name: 'Gemini 3.1 Pro (Preview)',
      description: 'Flagship model for deep analytical reasoning & complex math',
    },
    {
      id: 'gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      description: 'Frontier intelligence at scale',
    },
    {
      id: 'gemini-3-pro',
      name: 'Gemini 3 Pro',
      description: 'Deep multimodal reasoning and multi-step inquiry',
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Proven high-speed balanced reasoning model',
    },
  ],
  openai: [
    {
      id: 'gpt-4o',
      name: 'GPT-4o (Omni)',
      description: 'Flagship versatile intelligence & multimodal capabilities',
      recommended: true,
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
      id: 'o4-mini',
      name: 'o4-mini',
      description: 'Next-gen compact reasoning model for rapid problem solving',
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      description: 'Fast, lightweight model for everyday microlearning',
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
