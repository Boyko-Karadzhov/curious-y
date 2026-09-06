import type { TopicName } from './kingdom.ts';

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

export interface RewardLine { key: KnowledgeResourceKey; amount: number }
export interface LearningReward {
  id: string;
  correct: boolean;
  totalKnowledge: number;
  topicWeights: Partial<Record<TopicName, number>>;
  lines: RewardLine[];
}

/** Ignore malformed/unrecognized entries; scale before summing to avoid overflow. */
export function normalizeTopicWeights(input: unknown, fallbackTopic: string): Partial<Record<TopicName, number>> {
  const values = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const usable = KNOWLEDGE_RESOURCES.map(({ topic }) => ({ topic, weight: values[topic] }))
    .filter((item): item is { topic: TopicName; weight: number } =>
      typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0);
  if (!usable.length) {
    if (!KNOWLEDGE_RESOURCES.some(item => item.topic === fallbackTopic)) throw new Error('Unsupported reward topic.');
    return { [fallbackTopic]: 1 };
  }
  const max = Math.max(...usable.map(item => item.weight));
  const sum = usable.reduce((total, item) => total + item.weight / max, 0);
  return Object.fromEntries(usable.map(item => [item.topic, (item.weight / max) / sum]));
}

/** Hamilton allocation; resource order is the canonical tie breaker and output order. */
export function allocateResources(total: number, input: unknown, fallbackTopic: string): RewardLine[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid resource total.');
  const weights = normalizeTopicWeights(input, fallbackTopic);
  const parts = KNOWLEDGE_RESOURCES.map(({ key, topic }, order) => {
    const exact = total * (weights[topic] ?? 0);
    return { key, order, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = total - parts.reduce((sum, part) => sum + part.amount, 0);
  const ranked = [...parts].sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (let i = 0; i < remaining; i++) ranked[i % ranked.length].amount++;
  return parts.filter(part => part.amount > 0).map(({ key, amount }) => ({ key, amount }));
}

export function createLearningReward(id: string, correct: boolean, weights: unknown, topic: string): LearningReward {
  const topicWeights = normalizeTopicWeights(weights, topic);
  const totalKnowledge = correct ? 10 : 3;
  return { id, correct, totalKnowledge, topicWeights, lines: allocateResources(totalKnowledge, topicWeights, topic) };
}

