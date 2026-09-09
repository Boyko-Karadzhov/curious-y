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
  calculation?: import('./learningValue.ts').LearningValueBreakdown;
  id: string;
  correct: boolean;
  totalKnowledge: number;
  topicWeights: Partial<Record<TopicName, number>>;
  lines: RewardLine[];
}

/** Decimal integer weights avoid floating-point tie errors (e.g. 28 × .7/.2/.1). */
function integerWeights(input: unknown, fallbackTopic: string) {
    const values = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const usable = KNOWLEDGE_RESOURCES.map(({ topic }) => ({ topic, weight: values[topic] }))
        .filter((item): item is { topic: TopicName; weight: number } => typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0);
    if (!usable.length) {
        if (!KNOWLEDGE_RESOURCES.some(item => item.topic === fallbackTopic)) throw new Error('Unsupported reward topic.');
        return [{ topic: fallbackTopic as TopicName, weight: 1n }];
    }
    const parts = usable.map(({ topic, weight }) => {
        const [mantissa, exponent = '0'] = weight.toString().split('e');
        const decimals = mantissa.split('.')[1]?.length ?? 0;
        return { topic, digits: BigInt(mantissa.replace('.', '')), scale: decimals - Number(exponent) };
    });
    const scale = Math.max(...parts.map(part => part.scale));
    return parts.map(part => ({ topic: part.topic, weight: part.digits * 10n ** BigInt(scale - part.scale) }));
}

/** Ignore malformed entries; decimal arithmetic also avoids overflow during normalization. */
export function normalizeTopicWeights(input: unknown, fallbackTopic: string): Partial<Record<TopicName, number>> {
    const usable = integerWeights(input, fallbackTopic);
    const sum = usable.reduce((total, item) => total + item.weight, 0n);
    return Object.fromEntries(usable.map(item => [item.topic, item.weight === sum ? 1
        : Number('0.' + (item.weight * 10n ** 340n / sum).toString().padStart(340, '0'))]));
}

/** Hamilton allocation; resource order is the canonical tie breaker and output order. */
export function allocateResources(total: number, input: unknown, fallbackTopic: string): RewardLine[] {
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid resource total.');
    const weights = integerWeights(input, fallbackTopic);
    const sum = weights.reduce((total, item) => total + item.weight, 0n);
    const parts = KNOWLEDGE_RESOURCES.map(({ key, topic }, order) => {
        const exact = BigInt(total) * (weights.find(item => item.topic === topic)?.weight ?? 0n);
        return { key, order, amount: Number(exact / sum), remainder: exact % sum };
    });
    const remaining = total - parts.reduce((sum, part) => sum + part.amount, 0);
    const ranked = [...parts].sort((a, b) => a.remainder === b.remainder ? a.order - b.order : a.remainder > b.remainder ? -1 : 1);
    for (let i = 0; i < remaining; i++) ranked[i % ranked.length].amount++;
    return parts.filter(part => part.amount > 0).map(({ key, amount }) => ({ key, amount }));
}

export function createLearningReward(id: string, correct: boolean, weights: unknown, topic: string): LearningReward {
    const topicWeights = normalizeTopicWeights(weights, topic);
    const totalKnowledge = correct ? 10 : 3;
    return { id, correct, totalKnowledge, topicWeights, lines: allocateResources(totalKnowledge, topicWeights, topic) };
}

