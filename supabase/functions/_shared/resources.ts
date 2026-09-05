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

