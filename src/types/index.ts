import type { Dimension } from '../../supabase/functions/_shared/journey';
import {
    REASONING_COMPLEXITIES,
    REASONING_COMPLEXITY_INFO,
    type ReasoningComplexity
} from '../../supabase/functions/_shared/reasoning';

export { REASONING_COMPLEXITIES, REASONING_COMPLEXITY_INFO };
export type { ReasoningComplexity };

/** The user supplies a Gemini key; the backend owns the fixed provider and model. */
export interface UserSettings {
  apiKey: string;
  hasApiKey: boolean;
}


export type MasteryLevel = 'unseen' | 'learning' | 'proficient' | 'mastered';

export type ReasoningTrack = Record<ReasoningComplexity, number>;

export interface Concept {
  rewardAttempts?: number;
  rewardSuccesses?: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  nextDueAt?: string | null;
  reviewStep?: number;
  id?: string;
  userId?: string;
  canonicalName: string;
  definition: string;
  aliases: string[];
  topics: Record<string, number>;
  prerequisites: string[];
  mastery: MasteryLevel;
  reasoningTrack: ReasoningTrack;
  lastAsked?: string;
  isAtomic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Question {
  graphNodeId?: string;
  graphDimension?: Dimension;
  knowledgeEntry?: string;
  optionFeedback?: string[];
  demoGeneration?: number;
  topicWeights?: Partial<Record<TopicName, number>>;
  reward?: import('../../supabase/functions/_shared/resources').LearningReward;
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
  concept?: string;
  reasoningComplexity?: ReasoningComplexity;
  isBossQuestion?: boolean;
  requiredConcepts?: string[];
  prerequisitesMet?: boolean;
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
