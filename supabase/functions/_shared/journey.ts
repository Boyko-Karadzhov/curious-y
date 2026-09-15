import type { QuestionContent } from '../learning/questionContent.ts';
/** Shared discovery rules. Private plans are projected before they reach a live browser. */
export const FACETS = {
    intuition: {
        label: 'Intuition',
        description: 'Build a short, everyday explanation.'
    },
    precision: {
        label: 'Precision & math',
        description: 'Make the idea exact, with math where it helps.'
    },
    boundaries: {
        label: 'Limits & extremes',
        description: 'Explore what happens when conditions change.'
    },
    application: {
        label: 'Real-world uses',
        description: 'Recognize the idea in a new situation.'
    },
    mechanism: {
        label: 'How & why',
        description: 'Connect the idea to the principles behind it.'
    },
    alternatives: {
        label: 'Could it be otherwise?',
        description: 'Compare alternatives and question assumptions.'
    },
    advanced: {
        label: 'Advanced challenge',
        description: 'Combine the dimensions in an unfamiliar situation. Three correct advanced answers earn mastery.'
    },
    evidence: {
        label: 'How we know',
        description: 'Explore observations, discovery, and tests.'
    },
} as const;
export type Facet = keyof typeof FACETS;
export const FACET_ORDER = Object.keys(FACETS).filter(f => f !== 'advanced') as Facet[];
export type Requirement = {
    nodeId: string;
    facets: Facet[]
};
export interface JourneyNode {
  id: string;
  topic: string;
  title: string;
  /** Author context, never revealed before answering. */
  definition: string;
  facets: Facet[];
  requires: Requirement[];
  kind: 'concept' | 'boss';
  expanded?: boolean;
  /** Display names derived by the server from requires; never an AI-authored dependency list. */
  prerequisiteConcepts?: string[];
  topics?: string[];
  requiredMasteryIds?: string[];
  curriculum?: {
      dimensions?: Partial<Record<Facet, string>>;
      assessment?: QuestionContent;
      angle?: string;
      subtopic?: string;
      /** Durable continuation state for an unfinished generated node. */
      preparation?: {
          stage: 'dependencies' | 'match';
          names: string[]
      }
  };
}
export interface JourneyPlan {
    topic: string;
    nodes: JourneyNode[]
}
export interface FacetProgress {
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
export type JourneyProgress = Record<string, Partial<Record<Facet, FacetProgress>>>;
export interface LearningGraph {
    nodes: JourneyNode[];
    progress: JourneyProgress;
}
export interface VisibleNode extends Omit<JourneyNode, 'definition' | 'curriculum' | 'requiredMasteryIds'> {
  target?: JourneyTarget;
  progress: Partial<Record<Facet, FacetProgress>>;
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
export interface JourneyTarget {
    nodeId: string;
    facet: Facet
}
export const confirmed = (p?: FacetProgress) => (p?.successes ?? 0) >= 2;
export function nodeAvailable(node: JourneyNode, progress: JourneyProgress): boolean {
    return node.expanded !== false && (node.requiredMasteryIds ?? node.requires.map(r => r.nodeId))
        .every(id => FACET_ORDER.every(f => confirmed(progress[id]?.[f])) && (progress[id]?.advanced?.successes ?? 0) >= 3);
}

export const proficient = (node: Pick<JourneyNode, 'facets'>, progress: Partial<Record<Facet, FacetProgress>> = {}) => node.facets.every(f => confirmed(progress[f]));
export const reviewDue = (p?: FacetProgress, now = Date.now()) => confirmed(p) && now >= (p?.nextReviewAt ? Date.parse(p.nextReviewAt) : Date.parse(p?.lastSuccessAt ?? '') + 86400000);
export function nodeStatus(node: Omit<JourneyNode, 'definition' | 'curriculum'>, progress: JourneyProgress): VisibleNode['status'] {
    const p = progress[node.id] ?? {};
    if (node.kind === 'boss' && node.facets.every(f => (p[f]?.successes ?? 0) >= 1)) {
        return 'completed';
    }

    if (proficient(node, p)) {
        if (node.kind === 'boss') {
            return 'completed';
        }

        return (p.advanced?.successes ?? 0) >= 3 ? 'mastered' : 'proficient';
    }

    return node.facets.some(f => p[f]?.attempts) ? 'exploring' : 'discovered';
}

/** Project one graph; never expose hidden node identities, titles or definitions. */
export function knowledgeGraph(saved: LearningGraph): JourneyView {
    const visible = saved.nodes.filter(n => nodeAvailable(n, saved.progress));
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
    const { definition: _private, curriculum: _curriculum, requiredMasteryIds: _masteryIds, ...publicNode } = node;
    void _private;
    void _curriculum;
    void _masteryIds;
    const progress = allProgress[node.id] ?? {};
    return {
        ...publicNode,
        progress,
        status: nodeStatus(publicNode, allProgress),
        target: {
            nodeId: node.id,
            facet: nextFacet({
                ...publicNode,
                progress
            })
        },
        rusty: [...node.facets, 'advanced' as Facet].some(facet => reviewDue(progress[facet])),
    };
}

function frontier(node: JourneyNode, index: number, visibleIds: Set<string>, progress: JourneyProgress): JourneyView['frontiers'][number] {
    const contributions = node.requires.filter(requirement => visibleIds.has(requirement.nodeId));
    const ready = node.requires.filter(requirement => requirement.facets.every(facet => confirmed(progress[requirement.nodeId]?.[facet]))
        && (progress[requirement.nodeId]?.advanced?.successes ?? 0) >= 3).length;
    return {
        id: `frontier-${index}`,
        from: contributions.map(requirement => requirement.nodeId),
        contributions,
        ready,
        total: node.requires.length
    };
}

export const journeyView = knowledgeGraph;

/** Seven dimensions, two confirmations each, plus three advanced successes. */
export function conceptMastery(node: Pick<VisibleNode, 'kind' | 'facets' | 'progress'>): number {
    if (node.kind !== 'concept') {
        return 0;
    }

    const earned = node.facets.reduce((sum, f) => sum + Math.min(node.progress[f]?.successes ?? 0, 2), 0)
    + Math.min(node.progress.advanced?.successes ?? 0, 3);
    return Math.floor(100 * earned / (node.facets.length * 2 + 3));
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

export function nextFacet(node: Pick<VisibleNode, 'facets' | 'progress'> & { kind?: JourneyNode['kind'] }, now = Date.now()): Facet {
    return node.facets.find(f => !(node.progress[f]?.successes ?? 0))
    ?? node.facets.find(f => !confirmed(node.progress[f]))
    ?? (node.kind === 'concept' && (node.progress.advanced?.successes ?? 0) < 3 ? 'advanced' : undefined)
    ?? node.facets.find(f => reviewDue(node.progress[f], now))
    ?? [...node.facets, ...(node.kind === 'concept' ? ['advanced' as Facet] : [])]
        .sort((a, b) => (node.progress[a]?.attempts ?? 0) - (node.progress[b]?.attempts ?? 0))[0];
}

/** Ready bosses take precedence. Otherwise practice available concepts. */
export function selectJourneyTarget(graph: JourneyView, topic?: string, random = Math.random, scopeIds?: Set<string>): VisibleNode | undefined {
    const candidates = graph.nodes.filter(n => (scopeIds ? scopeIds.has(n.id) : !topic || n.topic === topic || n.topics?.includes(topic))
        && n.status !== 'completed' && n.status !== 'mastered');
    const bosses = candidates.filter(n => n.kind === 'boss');
    const pool = bosses.length ? bosses : candidates.filter(n => n.kind === 'concept');
    return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)];
}

export function recordFacet(previous: FacetProgress | undefined, correct: boolean, entry: string | undefined, now: string, questionKey?: string): FacetProgress {
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

function successfulAttempt(p: FacetProgress, entry: string | undefined, now: string, questionKey: string | undefined, fresh: boolean, due: boolean) {
    const reviewStep = due ? Math.min((p.reviewStep ?? 0) + 1, 4) : (p.reviewStep ?? 0);
    const days = [1, 3, 7, 14, 30][reviewStep];
    return {
        ...(questionKey && fresh ? { creditedQuestions: [...p.creditedQuestions ?? [], questionKey] } : {}),
        ...(entry ? { entry } : {}),
        firstSuccessAt: p.firstSuccessAt ?? now,
        lastSuccessAt: now,
        ...((p.successes + 1) >= 2 ? {
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

    const messages = advancedMilestone(old, node);
    for (const facet of [...node.facets, 'advanced' as Facet]) {
        messages.push(...facetMilestone(old, node, facet));
    }

    return messages;
}

function advancedMilestone(old: VisibleNode, node: VisibleNode): string[] {
    if ((node.progress.advanced?.successes ?? 0) <= (old.progress.advanced?.successes ?? 0)) {
        return [];
    }

    return [`Advanced challenge solved · ${Math.min(node.progress.advanced!.successes, 3)}/3 toward mastery`];
}

function facetMilestone(old: VisibleNode, node: VisibleNode, facet: Facet): string[] {
    if (!confirmed(old.progress[facet]) && confirmed(node.progress[facet])) {
        return [`${FACETS[facet].label} confirmed · ${node.title}`];
    }

    if (old.progress[facet]?.retainedAt !== node.progress[facet]?.retainedAt && node.progress[facet]?.retainedAt) {
        return [`${FACETS[facet].label} retained · ${node.title}`];
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

function validateConceptFacets(node: JourneyNode): void {
    if (!['concept', 'boss'].includes(node.kind) || !Array.isArray(node.facets) || !node.facets.length || node.facets.length > 7
        || new Set(node.facets).size !== node.facets.length || node.facets.some(facet => !FACET_ORDER.includes(facet))
        || !Array.isArray(node.requires)) {
        throw new Error('Invalid journey concept.');
    }
}

function normalizeConcept(node: JourneyNode, topic: string): void {
    if (node.kind === 'boss') {
        if (node.topic !== topic || node.facets.length !== 1 || node.facets[0] !== 'mechanism') {
            throw new Error('Invalid boss dimensions or topic.');
        }

        return;
    }

    if (FACET_ORDER.some(facet => !node.facets.includes(facet))) {
        throw new Error('Concepts need all seven dimensions.');
    }

    node.facets = [...FACET_ORDER];
}

function validateNewNodes(plan: JourneyPlan, topic: string, existing: JourneyNode[]): JourneyNode {
    const ids = new Set(existing.map(node => node.id));
    const names = new Set(existing.map(node => normalizeTitle(node.title)));
    for (const node of plan.nodes) {
        validateConceptIdentity(node, ids, names);
        validateConceptFacets(node);
        normalizeConcept(node, topic);
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

function validateRequirement(requirement: Requirement, context: PlanTraversal, isNew: boolean): void {
    const parent = context.all.find(node => node.id === requirement.nodeId);
    if (!parent || parent.kind === 'boss' || !Array.isArray(requirement.facets) || !requirement.facets.length
        || new Set(requirement.facets).size !== requirement.facets.length || requirement.facets.length !== parent.facets.length
        || requirement.facets.some(facet => !parent.facets.includes(facet))) {
        throw new Error('Invalid prerequisite.');
    }

    if (isNew) {
        requirement.facets = [...FACET_ORDER];
    }

    visitPlanNode(parent, context);
}

function visitRequirements(node: JourneyNode, context: PlanTraversal): void {
    if (new Set(node.requires.map(requirement => requirement.nodeId)).size !== node.requires.length) {
        throw new Error('Duplicate dependency.');
    }

    for (const requirement of node.requires) {
        validateRequirement(requirement, context, context.proposed.has(node));
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
    // Edges are the dependency contract; derive display names only for new nodes.
    if (context.proposed.has(node)) {
        node.prerequisiteConcepts = node.requires.map(requirement => context.all.find(parent => parent.id === requirement.nodeId)!.title);
    }

    context.path.delete(node.id);
    context.visited.add(node.id);
}

/** Reject cycles, orphan branches, invented facets and unreachable bosses. */
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

    boss.requiredMasteryIds = [...context.visited].filter(id => id !== boss.id);
    return plan;
}
