import { Question, ReasoningComplexity, TopicName, TOPICS } from '../types';

export type KnowledgeResourceKey =
  | 'force'
  | 'runes'
  | 'reagents'
  | 'essence'
  | 'cores'
  | 'astral'
  | 'insight'
  | 'influence';

export interface KnowledgeResource {
  key: KnowledgeResourceKey;
  topic: TopicName;
  name: string;
  symbol: string;
  color: string;
  description: string;
}

export const KNOWLEDGE_RESOURCES: KnowledgeResource[] = [
  { key: 'force', topic: 'Physics', name: 'Force', symbol: '⚙', color: '#7dd3fc', description: 'Armor & siege' },
  { key: 'runes', topic: 'Mathematics & Logic', name: 'Runes', symbol: '◆', color: '#c4b5fd', description: 'Accuracy & crit' },
  { key: 'reagents', topic: 'Chemistry', name: 'Reagents', symbol: '▲', color: '#fb923c', description: 'Fire & alchemy' },
  { key: 'essence', topic: 'Life', name: 'Essence', symbol: '✿', color: '#86efac', description: 'Health & healing' },
  { key: 'cores', topic: 'Computer Science', name: 'Logic Cores', symbol: '⚡', color: '#67e8f9', description: 'Automation' },
  { key: 'astral', topic: 'Earth & Space', name: 'Astral Dust', symbol: '✦', color: '#f0abfc', description: 'Range & control' },
  { key: 'insight', topic: 'Mind & Behavior', name: 'Insight', symbol: '◉', color: '#f9a8d4', description: 'Morale & evasion' },
  { key: 'influence', topic: 'Society & History', name: 'Influence', symbol: '♛', color: '#fcd34d', description: 'Command & economy' },
];

export type KnowledgeBalances = Record<KnowledgeResourceKey, number>;

export interface RewardLine {
  key: KnowledgeResourceKey;
  amount: number;
}

export interface LearningReward {
  id: string;
  correct: boolean;
  gold: number;
  keys: number;
  totalKnowledge: number;
  multiplier: number;
  multiplierLabel: string;
  lines: RewardLine[];
}

export interface GameState {
  dayStamp: string;
  castleLevel: number;
  castleXp: number;
  gold: number;
  gems: number;
  keys: number;
  knowledge: KnowledgeBalances;
  answersToday: number;
  correctToday: number;
  dailyClaimed: boolean;
  streak: number;
  trophies: number;
  warPressure: number;
}

const reasoningMultipliers: Record<ReasoningComplexity, number> = {
  directInference: 1,
  composition: 1.15,
  discrimination: 1.2,
  transfer: 1.3,
  counterfactual: 1.4,
  synthesis: 1.55,
  derivation: 1.75,
};

const resourceByTopic = new Map(KNOWLEDGE_RESOURCES.map((resource) => [resource.topic, resource]));

export const createInitialGameState = (): GameState => ({
  dayStamp: new Date().toISOString().slice(0, 10),
  castleLevel: 1,
  castleXp: 42,
  gold: 840,
  gems: 35,
  keys: 1,
  knowledge: {
    force: 72,
    runes: 54,
    reagents: 28,
    essence: 41,
    cores: 33,
    astral: 19,
    insight: 26,
    influence: 37,
  },
  answersToday: 2,
  correctToday: 2,
  dailyClaimed: false,
  streak: 4,
  trophies: 1184,
  warPressure: 52,
});

const isTopicName = (value: string): value is TopicName =>
  (TOPICS as readonly string[]).includes(value);

const formatMultiplierLabel = (question: Question, correct: boolean): string => {
  if (!correct) return 'Recovery reward';
  if (question.isBossQuestion) return 'Boss encounter';
  if (question.reasoningComplexity) {
    const spaced = question.reasoningComplexity.replace(/([A-Z])/g, ' $1').toLowerCase();
    return `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)} reasoning`;
  }
  return 'Learning value';
};

export const calculateLearningReward = (
  question: Question,
  correct: boolean,
  topicWeights?: Record<string, number>
): LearningReward => {
  const reasoningMultiplier = question.reasoningComplexity
    ? reasoningMultipliers[question.reasoningComplexity]
    : 1;
  const bossMultiplier = question.isBossQuestion ? 4 : 1;
  const correctnessMultiplier = correct ? 1 : 0.2;
  const multiplier = reasoningMultiplier * bossMultiplier * correctnessMultiplier;
  const totalKnowledge = Math.max(correct ? 10 : 3, Math.round(20 * multiplier));

  const usableWeights = Object.entries(topicWeights || {})
    .filter(([topic, weight]) => isTopicName(topic) && Number.isFinite(weight) && weight > 0)
    .map(([topic, weight]) => [topic as TopicName, weight] as const);

  const weights = usableWeights.length > 0
    ? usableWeights
    : [[isTopicName(question.topic) ? question.topic : 'Physics', 1] as const];
  const weightTotal = weights.reduce((sum, [, weight]) => sum + weight, 0);

  const lines = weights
    .map(([topic, weight]) => {
      const resource = resourceByTopic.get(topic)!;
      return {
        key: resource.key,
        amount: Math.max(1, Math.round(totalKnowledge * (weight / weightTotal))),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    correct,
    gold: correct ? (question.isBossQuestion ? 160 : 32) : 8,
    keys: correct && question.isBossQuestion ? 1 : 0,
    totalKnowledge,
    multiplier,
    multiplierLabel: formatMultiplierLabel(question, correct),
    lines,
  };
};

export const applyLearningReward = (state: GameState, reward: LearningReward): GameState => {
  const knowledge = { ...state.knowledge };
  reward.lines.forEach(({ key, amount }) => {
    knowledge[key] += amount;
  });

  return {
    ...state,
    knowledge,
    gold: state.gold + reward.gold,
    keys: state.keys + reward.keys,
    answersToday: state.answersToday + 1,
    correctToday: state.correctToday + (reward.correct ? 1 : 0),
    castleXp: Math.min(100, state.castleXp + (reward.correct ? 8 : 2)),
    warPressure: Math.min(94, state.warPressure + (reward.correct ? 2 : 0.5)),
  };
};

export const CASTLE_UPGRADE_COST = { force: 100, runes: 75, gold: 500 } as const;

export const canUpgradeCastle = (state: GameState): boolean =>
  state.knowledge.force >= CASTLE_UPGRADE_COST.force &&
  state.knowledge.runes >= CASTLE_UPGRADE_COST.runes &&
  state.gold >= CASTLE_UPGRADE_COST.gold;

export const upgradeCastle = (state: GameState): GameState => {
  if (!canUpgradeCastle(state)) return state;
  return {
    ...state,
    castleLevel: state.castleLevel + 1,
    castleXp: 0,
    gold: state.gold - CASTLE_UPGRADE_COST.gold,
    knowledge: {
      ...state.knowledge,
      force: state.knowledge.force - CASTLE_UPGRADE_COST.force,
      runes: state.knowledge.runes - CASTLE_UPGRADE_COST.runes,
    },
  };
};

export const canClaimDaily = (state: GameState): boolean =>
  state.answersToday >= 5 && !state.dailyClaimed;

export const claimDailyReward = (state: GameState): GameState => {
  if (!canClaimDaily(state)) return state;
  return {
    ...state,
    dailyClaimed: true,
    gold: state.gold + 250,
    keys: state.keys + 1,
  };
};
