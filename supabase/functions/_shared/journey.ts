import balance from './game-balance.json' with { type: 'json' };
import type { QuestionContent } from '../learning/questionContent.ts';
import { REASONING_COMPLEXITIES, type ReasoningComplexity } from './reasoning.ts';
/** Shared discovery rules. Private plans are projected before they reach a live browser. */
export const DIMENSIONS = {
    intuition: {
        label: 'Intuition',
        description: 'A short, self-contained, everyday explanation that helps build intuition against the concept.'
    },
    precision: {
        label: 'Precision & math',
        description: 'Make the idea exact, with math where it helps.'
    },
    boundaries: {
        label: 'Limits & extremes',
        description: 'Explore limiting cases, including zero and infinity where meaningful, and explain where the model fails.'
    },
    application: {
        label: 'Real-world uses',
        description: 'Explain concrete real-world uses and what the idea predicts.'
    },
    mechanism: {
        label: 'Why Does It Make Sense? (Fundamental Principles)',
        description: 'Build the idea from more basic principles, showing how each step makes the result reasonable.'
    },
    alternatives: {
        label: 'Why It Cannot Be Any Other Way',
        description: 'Imagine the idea were false. Follow the consequences to see what would contradict basic principles or what we observe.'
    },
    evidence: {
        label: 'How we know',
        description: 'Explain how we know through historical discovery, method, and independent validation; distinguish observation, inference, and proof without inventing dates or attribution.'
    },
} as const;
export type Dimension = keyof typeof DIMENSIONS;
export const DIMENSION_ORDER = Object.keys(DIMENSIONS) as Dimension[];
export type Requirement = { nodeId: string };
interface JourneyNodeBase {
  id: string;
  topic: string;
  title: string;
  /** Author context, never revealed before answering. */
  definition: string;
  requires: Requirement[];
  expanded?: boolean;
  topics?: string[];
}
export interface ConceptNode extends JourneyNodeBase {
  kind: 'concept';
  dimensions: Partial<Record<Dimension, string>>
}
export interface BossNode extends JourneyNodeBase {
  kind: 'boss';
  dimensions: Record<string, never>;
  bossQuestion?: QuestionContent;
  context?: {
      angle: string;
      subtopic: string
  }
}
export type JourneyNode = ConceptNode | BossNode;
export interface JourneyPlan {
    topic: string;
    nodes: JourneyNode[]
}
export interface StepProgress {
  attempts: number;
  successes: number;
  entry?: string;
  firstSuccessAt?: string;
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  retainedAt?: string;
  lastCorrect?: boolean;
  reviewStep?: number;
  nextReviewAt?: string;
  creditedQuestions?: string[];
}
export type ProgressKey = Dimension | ReasoningComplexity | 'boss';
export type NodeProgress = Partial<Record<ProgressKey, StepProgress>>;
export type JourneyProgress = Record<string, NodeProgress>;
export interface LearningGraph {
    nodes: JourneyNode[];
    progress: JourneyProgress;
}
export interface VisibleNode extends Omit<JourneyNodeBase, 'definition'> {
  kind: JourneyNode['kind'];
  target?: JourneyTarget;
  progress: NodeProgress;
  status: 'discovered' | 'exploring' | 'proficient' | 'mastered' | 'completed';
  rusty: boolean;
}
export interface JourneyView {
  id: string;
  title: string;
  nodes: VisibleNode[];
  frontiers: {
      id: string;
      from: string[];
      ready: number;
      total: number;
      contributions: Requirement[]
  }[];
}
export type JourneyStep =
    | {
        kind: 'dimension';
        dimension: Dimension
    }
    | {
        kind: 'reasoning';
        reasoningComplexity: ReasoningComplexity
    }
    | { kind: 'boss' };
export type JourneyTarget = JourneyStep & { nodeId: string };
export const nodeDimensions = (node: Pick<JourneyNode, 'kind'>): Dimension[] => node.kind === 'concept' ? DIMENSION_ORDER : [];
export const confirmed = (p?: StepProgress) => (p?.successes ?? 0) >= 1;
export const targetKey = (target: JourneyTarget): ProgressKey => target.kind === 'dimension'
    ? target.dimension : target.kind === 'reasoning' ? target.reasoningComplexity : 'boss';
export function nodeAvailable(node: JourneyNode, nodes: JourneyNode[], progress: JourneyProgress): boolean {
    return node.expanded !== false && prerequisitesMastered(node, nodes, progress);
}

export function prerequisitesMastered(node: JourneyNode, nodes: JourneyNode[], progress: JourneyProgress): boolean {
    return prerequisiteIds(node, nodes)
        .every(id => conceptMastered(progress[id]));
}

function prerequisiteIds(node: JourneyNode, nodes: JourneyNode[], ids = new Set<string>()): string[] {
    for (const requirement of node.requires) {
        if (ids.has(requirement.nodeId)) {
            continue;
        }

        ids.add(requirement.nodeId);
        const parent = nodes.find(candidate => candidate.id === requirement.nodeId);
        if (parent) {
            prerequisiteIds(parent, nodes, ids);
        }
    }

    return [...ids];
}

export const conceptMastered = (progress: NodeProgress = {}) =>
    DIMENSION_ORDER.every(dimension => confirmed(progress[dimension]))
    && REASONING_COMPLEXITIES.every(complexity => confirmed(progress[complexity]));
export const proficient = (node: Pick<JourneyNode, 'kind'>, progress: NodeProgress = {}) =>
    node.kind === 'concept' ? DIMENSION_ORDER.every(dimension => confirmed(progress[dimension])) : confirmed(progress.boss);
export const reviewDue = (p?: StepProgress, now = Date.now()) => confirmed(p) && now >= (p?.nextReviewAt ? Date.parse(p.nextReviewAt) : Date.parse(p?.lastSuccessAt ?? '') + 86400000);
export function nodeStatus(node: Pick<VisibleNode, 'id' | 'kind'>, progress: JourneyProgress): VisibleNode['status'] {
    const p = progress[node.id] ?? {};
    if (node.kind === 'boss' && confirmed(p.boss)) {
        return 'completed';
    }

    if (proficient(node, p)) {
        if (node.kind === 'boss') {
            return 'completed';
        }

        return conceptMastered(p) ? 'mastered' : 'proficient';
    }

    return Object.values(p).some(step => step?.attempts) ? 'exploring' : 'discovered';
}

/** Project one graph; never expose hidden node identities, titles or definitions. */
export function knowledgeGraph(saved: LearningGraph): JourneyView {
    const visible = saved.nodes.filter(n => nodeAvailable(n, saved.nodes, saved.progress));
    const ids = new Set(visible.map(n => n.id));
    return {
        id: 'knowledge',
        title: 'Your knowledge graph',
        nodes: visible.map(node => visibleNode(node, saved.progress)),
        frontiers: saved.nodes.filter(n => !ids.has(n.id) && n.requires.some(r => ids.has(r.nodeId)))
            .map((node, index) => frontier(node, index, ids, saved.progress)),
    };
}

function visibleNode(node: JourneyNode, allProgress: JourneyProgress): VisibleNode {
    const progress = allProgress[node.id] ?? {};
    const publicNode = {
        id: node.id,
        topic: node.topic,
        title: node.title,
        requires: node.requires,
        kind: node.kind,
        expanded: node.expanded,
        topics: node.topics
    };
    return {
        ...publicNode,
        progress,
        status: nodeStatus(publicNode, allProgress),
        target: {
            nodeId: node.id,
            ...nextTarget({
                ...publicNode,
                progress
            })
        },
        rusty: Object.values(progress).some(step => reviewDue(step)),
    };
}

function frontier(node: JourneyNode, index: number, visibleIds: Set<string>, progress: JourneyProgress): JourneyView['frontiers'][number] {
    const contributions = node.requires.filter(requirement => visibleIds.has(requirement.nodeId));
    const ready = node.requires.filter(requirement => conceptMastered(progress[requirement.nodeId])).length;
    return {
        id: `frontier-${index}`,
        from: contributions.map(requirement => requirement.nodeId),
        contributions,
        ready,
        total: node.requires.length
    };
}

export const journeyView = knowledgeGraph;

/** Seven knowledge dimensions plus one success at each reasoning complexity. */
export function conceptMastery(node: Pick<VisibleNode, 'kind' | 'progress'>): number {
    if (node.kind !== 'concept') {
        return 0;
    }

    const keys: ProgressKey[] = [...DIMENSION_ORDER, ...REASONING_COMPLEXITIES];
    const earned = keys.filter(key => confirmed(node.progress[key])).length;
    return Math.floor(100 * earned / keys.length);
}

/** Topic practice also reaches shared prerequisites from any other topic. */
export function topicNodeIds(nodes: JourneyNode[], topic?: string): Set<string> {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const ids = new Set<string>();
    const visit = (id: string) => {
        if (ids.has(id)) {
            return;
        }

        ids.add(id); byId.get(id)?.requires.forEach(r => visit(r.nodeId));
    };

    nodes.filter(n => !topic || (n.topic === topic || n.topics?.includes(topic))).forEach(n => visit(n.id));
    return ids;
}

export function nextTarget(node: Pick<VisibleNode, 'id' | 'kind' | 'progress'>, now = Date.now()): JourneyStep {
    if (node.kind === 'boss') {
        return { kind: 'boss' };
    }

    const dimension = DIMENSION_ORDER.find(item => !confirmed(node.progress[item]));
    if (dimension) {
        return {
            kind: 'dimension',
            dimension
        };
    }

    const reasoning = REASONING_COMPLEXITIES.find(item => !confirmed(node.progress[item]));
    if (reasoning) {
        return {
            kind: 'reasoning',
            reasoningComplexity: reasoning
        };
    }

    return reviewTarget(node.progress, now);
}

function reviewTarget(progress: NodeProgress, now: number): JourneyStep {
    const dimension = DIMENSION_ORDER.find(item => reviewDue(progress[item], now));
    if (dimension) {
        return {
            kind: 'dimension',
            dimension
        };
    }

    const keys = [...DIMENSION_ORDER, ...REASONING_COMPLEXITIES] as ProgressKey[];
    const key = keys.sort((a, b) => (progress[a]?.attempts ?? 0) - (progress[b]?.attempts ?? 0))[0];
    return DIMENSION_ORDER.includes(key as Dimension)
        ? {
            kind: 'dimension',
            dimension: key as Dimension
        }
        : {
            kind: 'reasoning',
            reasoningComplexity: key as ReasoningComplexity
        };
}

/** Ready bosses take precedence. Otherwise practice available concepts. */
export function selectJourneyTarget(graph: JourneyView, topic?: string, random = Math.random, scopeIds?: Set<string>): VisibleNode | undefined {
    const candidates = graph.nodes.filter(n => (scopeIds ? scopeIds.has(n.id) : !topic || n.topic === topic || n.topics?.includes(topic))
        && n.status !== 'completed' && n.status !== 'mastered');
    const bosses = candidates.filter(n => n.kind === 'boss');
    const pool = bosses.length ? bosses : candidates.filter(n => n.kind === 'concept');
    return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)];
}

export function recordProgress(previous: StepProgress | undefined, correct: boolean, entry: string | undefined, now: string, questionKey?: string): StepProgress {
    const p = previous ?? {
        attempts: 0,
        successes: 0
    };
    const fresh = !questionKey || !p.creditedQuestions?.includes(questionKey);
    const due = reviewDue(p, Date.parse(now));
    const update = correct ? successfulAttempt(p, entry, now, questionKey, fresh, due) : missedAttempt(now, due);
    return {
        ...p,
        attempts: p.attempts + 1,
        successes: p.successes + Number(correct && fresh),
        lastAttemptAt: now,
        lastCorrect: correct,
        ...update
    };
}

function successfulAttempt(p: StepProgress, entry: string | undefined, now: string, questionKey: string | undefined, fresh: boolean, due: boolean) {
    const reviewStep = due ? Math.min((p.reviewStep ?? 0) + 1, balance.learningValue.reviewDays.length - 1) : (p.reviewStep ?? 0);
    const days = balance.learningValue.reviewDays[reviewStep];
    return {
        ...(questionKey && fresh ? { creditedQuestions: [...p.creditedQuestions ?? [], questionKey] } : {}),
        ...(entry ? { entry } : {}),
        firstSuccessAt: p.firstSuccessAt ?? now,
        lastSuccessAt: now,
        ...((p.successes + 1) >= 1 ? {
            reviewStep,
            nextReviewAt: new Date(Date.parse(now) + days * 86400000).toISOString()
        } : {}),
        ...(due ? { retainedAt: now } : {}),
    };
}

function missedAttempt(now: string, due: boolean) {
    return due ? {
        reviewStep: 0,
        nextReviewAt: new Date(Date.parse(now) + 600000).toISOString()
    } : {};
}

export function journeyMilestones(before: JourneyView, after: JourneyView): string[] {
    const messages: string[] = [];
    for (const node of after.nodes) {
        messages.push(...nodeMilestones(before.nodes.find(old => old.id === node.id), node));
    }

    return messages;
}

function nodeMilestones(old: VisibleNode | undefined, node: VisibleNode): string[] {
    if (!old) {
        return [node.kind === 'boss' ? 'The hidden question is revealed!' : `Discovered: ${node.title}`];
    }

    if (old.status !== node.status && ['proficient', 'mastered', 'completed'].includes(node.status)) {
        return [node.status === 'completed' ? 'Boss conquered. More discoveries await.' : `${node.title}: ${node.status}`];
    }

    const messages: string[] = [];
    for (const key of progressKeys(node)) {
        messages.push(...progressMilestone(old, node, key));
    }

    return messages;
}

function progressKeys(node: Pick<VisibleNode, 'kind'>): ProgressKey[] {
    return node.kind === 'boss' ? ['boss'] : [...DIMENSION_ORDER, ...REASONING_COMPLEXITIES];
}

function progressMilestone(old: VisibleNode, node: VisibleNode, key: ProgressKey): string[] {
    if (!confirmed(old.progress[key]) && confirmed(node.progress[key])) {
        return [`${key} completed · ${node.title}`];
    }

    if (old.progress[key]?.retainedAt !== node.progress[key]?.retainedAt && node.progress[key]?.retainedAt) {
        return [`${key} retained · ${node.title}`];
    }

    return [];
}

const validText = (value: unknown, max: number): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const normalizeTitle = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function planShape(value: unknown, topic: string): JourneyPlan {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid journey plan.');
    }

    const plan = value as JourneyPlan;
    if (plan.topic !== topic || !Array.isArray(plan.nodes) || plan.nodes.length < 1 || plan.nodes.length > 129) {
        throw new Error('Invalid journey structure.');
    }

    return plan;
}

function validateConceptIdentity(node: JourneyNode, ids: Set<string>, names: Set<string>): void {
    if (!node || !/^[a-z][a-z0-9-]{0,79}$/.test(node.id) || ids.has(node.id)
        || !validText(node.title, node.kind === 'boss' ? 1600 : 200) || names.has(normalizeTitle(node.title))
        || !validText(node.definition, 1800) || !validText(node.topic, 80)) {
        throw new Error('Invalid journey concept.');
    }
}

function validateNodeDimensions(node: JourneyNode, topic: string): void {
    const keys = node.dimensions && typeof node.dimensions === 'object' ? Object.keys(node.dimensions) : [];
    if (!['concept', 'boss'].includes(node.kind) || !node.dimensions || typeof node.dimensions !== 'object'
        || !Array.isArray(node.requires) || keys.some(dimension => !DIMENSION_ORDER.includes(dimension as Dimension))) {
        throw new Error('Invalid journey concept.');
    }

    if (node.kind === 'boss' && (node.topic !== topic || keys.length)) {
        throw new Error('Invalid boss dimensions or topic.');
    }

    const required = node.expanded === false ? ['intuition', 'precision'] as Dimension[] : DIMENSION_ORDER;
    if (node.kind === 'concept' && (keys.length !== required.length
        || required.some(facet => !validText(node.dimensions[facet], 1600)))) {
        throw new Error('Concepts need content for all seven dimensions.');
    }
}

function validateNewNodes(plan: JourneyPlan, topic: string, existing: JourneyNode[]): JourneyNode {
    const ids = new Set(existing.map(node => node.id));
    const names = new Set(existing.map(node => normalizeTitle(node.title)));
    for (const node of plan.nodes) {
        validateConceptIdentity(node, ids, names);
        validateNodeDimensions(node, topic);
        ids.add(node.id);
        names.add(normalizeTitle(node.title));
    }

    const bosses = plan.nodes.filter(node => node.kind === 'boss');
    if (bosses.length !== 1) {
        throw new Error('A proposal needs one synthesis boss.');
    }

    return bosses[0];
}

type PlanTraversal = {
    all: JourneyNode[];
    proposed: Set<JourneyNode>;
    visited: Set<string>;
    path: Set<string>;
};

function validateRequirement(requirement: Requirement, context: PlanTraversal): void {
    const parent = context.all.find(node => node.id === requirement.nodeId);
    if (!parent || parent.kind === 'boss' || Object.keys(requirement).length !== 1) {
        throw new Error('Invalid prerequisite.');
    }

    visitPlanNode(parent, context);
}

function visitRequirements(node: JourneyNode, context: PlanTraversal): void {
    if (new Set(node.requires.map(requirement => requirement.nodeId)).size !== node.requires.length) {
        throw new Error('Duplicate dependency.');
    }

    for (const requirement of node.requires) {
        validateRequirement(requirement, context);
    }
}

function visitPlanNode(node: JourneyNode, context: PlanTraversal): void {
    if (context.path.has(node.id)) {
        throw new Error('Journey contains a cycle.');
    }

    if (context.visited.has(node.id)) {
        return;
    }

    context.path.add(node.id);
    visitRequirements(node, context);
    context.path.delete(node.id);
    context.visited.add(node.id);
}

/** Reject cycles, orphan branches, invalid dimensions and unreachable bosses. */
export function validateJourneyPlan(value: unknown, topic: string, existing: JourneyNode[] = []): JourneyPlan {
    const plan = planShape(value, topic);
    const boss = validateNewNodes(plan, topic, existing);
    const context = {
        all: [...existing, ...plan.nodes],
        proposed: new Set(plan.nodes),
        visited: new Set<string>(),
        path: new Set<string>()
    };
    visitPlanNode(boss, context);
    if (plan.nodes.some(node => !context.visited.has(node.id))) {
        throw new Error('Every concept must contribute to the boss.');
    }

    return plan;
}
