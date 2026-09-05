/** The user supplies a Gemini key; the backend owns the fixed provider and model. */
export interface UserSettings {
  apiKey: string;
  hasApiKey: boolean;
}


export type ReasoningComplexity =
  | 'directInference'
  | 'composition'
  | 'discrimination'
  | 'transfer'
  | 'counterfactual'
  | 'synthesis'
  | 'derivation';

export const REASONING_COMPLEXITIES: ReasoningComplexity[] = [
  'directInference',
  'composition',
  'discrimination',
  'transfer',
  'counterfactual',
  'synthesis',
  'derivation',
];

export const REASONING_COMPLEXITY_INFO: Record<
  ReasoningComplexity,
  { name: string; description: string }
> = {
  directInference: {
    name: 'Direct inference',
    description: 'apply one mastered concept to obtain a consequence.',
  },
  composition: {
    name: 'Composition',
    description: 'combine several mastered concepts into a reasoning chain.',
  },
  discrimination: {
    name: 'Discrimination',
    description: 'distinguish between plausible competing explanations.',
  },
  transfer: {
    name: 'Transfer',
    description: 'recognize and apply concepts in an unfamiliar context.',
  },
  counterfactual: {
    name: 'Counterfactual',
    description: 'change/remove an assumption and reason through the consequences.',
  },
  synthesis: {
    name: 'Synthesis',
    description: 'integrate multiple concepts to explain or resolve a complex phenomenon.',
  },
  derivation: {
    name: 'Derivation',
    description: 'reconstruct a result from deeper principles with minimal assumptions.',
  },
};

export type MasteryLevel = 'unseen' | 'learning' | 'proficient' | 'mastered';

export type ReasoningTrack = Record<ReasoningComplexity, number>;

export interface Concept {
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
