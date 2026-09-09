/** Shared discovery rules. Private plans are projected before they reach a live browser. */
export const FACETS = {
    intuition: { label: 'Intuition', description: 'Build a short, everyday explanation.' },
    precision: { label: 'Precision & math', description: 'Make the idea exact, with math where it helps.' },
    boundaries: { label: 'Limits & extremes', description: 'Explore what happens when conditions change.' },
    application: { label: 'Real-world uses', description: 'Recognize the idea in a new situation.' },
    mechanism: { label: 'How & why', description: 'Connect the idea to the principles behind it.' },
    alternatives: { label: 'Could it be otherwise?', description: 'Compare alternatives and question assumptions.' },
    advanced: { label: 'Advanced challenge', description: 'Combine the dimensions in an unfamiliar situation. Three correct advanced answers earn mastery.' },
    evidence: { label: 'How we know', description: 'Explore observations, discovery, and tests.' },
} as const;
export type Facet = keyof typeof FACETS;
export const FACET_ORDER = Object.keys(FACETS).filter(f => f !== 'advanced') as Facet[];
export type Requirement = { nodeId: string; facets: Facet[] };
export interface JourneyNode {
  id: string;
  topic: string;
  title: string;
  /** Author context, never revealed before answering. */
  definition: string;
  facets: Facet[];
  requires: Requirement[];
  kind: 'concept' | 'boss';
  /** Display names derived by the server from requires; never an AI-authored dependency list. */
  prerequisiteConcepts?: string[];
}
export interface JourneyPlan { topic: string; nodes: JourneyNode[] }
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
export interface LearningGraph { nodes: JourneyNode[]; progress: JourneyProgress }
export interface VisibleNode extends Omit<JourneyNode, 'definition'> {
  target?: JourneyTarget;
  progress: Partial<Record<Facet, FacetProgress>>;
  status: 'discovered' | 'exploring' | 'proficient' | 'mastered' | 'completed';
  rusty: boolean;
}
export interface JourneyView {
  id: string; title: string;
  nodes: VisibleNode[];
  frontiers: { id: string; from: string[]; ready: number; total: number; contributions: Requirement[] }[];
}
export interface JourneyTarget { nodeId: string; facet: Facet }
export const confirmed = (p?: FacetProgress) => (p?.successes ?? 0) >= 2;
export function nodeAvailable(node: JourneyNode, progress: JourneyProgress): boolean {
    return node.requires.every(r => r.facets.every(f => confirmed(progress[r.nodeId]?.[f])));
}
export const proficient = (node: Pick<JourneyNode, 'facets'>, progress: Partial<Record<Facet, FacetProgress>> = {}) => node.facets.every(f => confirmed(progress[f]));
export const reviewDue = (p?: FacetProgress, now = Date.now()) => confirmed(p) && now >= (p?.nextReviewAt ? Date.parse(p.nextReviewAt) : Date.parse(p?.lastSuccessAt ?? '') + 86400000);
export function nodeStatus(node: Omit<JourneyNode, 'definition'>, progress: JourneyProgress): VisibleNode['status'] {
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
        id: 'knowledge', title: 'Your knowledge graph',
        nodes: visible.map(({ definition: _private, ...n }) => {
            const progress = saved.progress[n.id] ?? {};
            return { ...n, progress, status: nodeStatus(n, saved.progress),
                target: { nodeId: n.id, facet: nextFacet({ ...n, progress }) },
                rusty: [...n.facets, 'advanced' as Facet].some(f => reviewDue(progress[f])) };
        }),
        frontiers: saved.nodes.filter(n => !ids.has(n.id) && n.requires.some(r => ids.has(r.nodeId))).map((n, index) => ({
            id: `frontier-${index}`, from: n.requires.filter(r => ids.has(r.nodeId)).map(r => r.nodeId),
            contributions: n.requires.filter(r => ids.has(r.nodeId)),
            ready: n.requires.filter(r => r.facets.every(f => confirmed(saved.progress[r.nodeId]?.[f]))).length,
            total: n.requires.length,
        })),
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
    nodes.filter(n => !topic || n.topic === topic).forEach(n => visit(n.id));
    return ids;
}

export function nextFacet(node: Pick<VisibleNode, 'facets' | 'progress'> & { kind?: JourneyNode['kind'] }, now = Date.now()): Facet {
    return node.facets.find(f => !confirmed(node.progress[f]))
    ?? node.facets.find(f => reviewDue(node.progress[f], now))
    ?? (node.kind === 'concept' ? 'advanced' : undefined)
    ?? [...node.facets].sort((a, b) => (node.progress[a]?.attempts ?? 0) - (node.progress[b]?.attempts ?? 0))[0];
}

/** Ready bosses take precedence. Otherwise practice available concepts. */
export function selectJourneyTarget(graph: JourneyView, topic?: string, random = Math.random, scopeIds?: Set<string>): VisibleNode | undefined {
    const candidates = graph.nodes.filter(n => (scopeIds ? scopeIds.has(n.id) : !topic || n.topic === topic) && n.status !== 'completed');
    const bosses = candidates.filter(n => n.kind === 'boss');
    if (bosses.length) {
        return bosses[Math.min(Math.floor(random() * bosses.length), bosses.length - 1)];
    }
    const learning = candidates.some(n => !proficient(n, n.progress));
    const weights = candidates.map(n => learning && proficient(n, n.progress) ? 0.2 : 1);
    let draw = random() * weights.reduce((sum, w) => sum + w, 0);
    return candidates.find((_, i) => (draw -= weights[i]) < 0) ?? candidates.at(-1);
}

export function recordFacet(previous: FacetProgress | undefined, correct: boolean, entry: string, now: string, questionKey?: string): FacetProgress {
    const p = previous ?? { attempts: 0, successes: 0 };
    const fresh = !questionKey || !p.creditedQuestions?.includes(questionKey);
    const due = reviewDue(p, Date.parse(now));
    const reviewStep = due && correct ? Math.min((p.reviewStep ?? 0) + 1, 4) : due && !correct ? 0 : (p.reviewStep ?? 0);
    const days = [1, 3, 7, 14, 30][reviewStep];
    return { ...p, attempts: p.attempts + 1, successes: p.successes + Number(correct && fresh), lastAttemptAt: now, lastCorrect: correct,
        ...(correct ? { ...(questionKey && fresh ? { creditedQuestions: [...p.creditedQuestions ?? [], questionKey] } : {}), entry, firstSuccessAt: p.firstSuccessAt ?? now, lastSuccessAt: now,
            ...((p.successes + 1) >= 2 ? { reviewStep, nextReviewAt: new Date(Date.parse(now) + days * 86400000).toISOString() } : {}),
            ...(due ? { retainedAt: now } : {}) } : due ? { reviewStep: 0, nextReviewAt: new Date(Date.parse(now) + 600000).toISOString() } : {}),
    };
}
export function journeyMilestones(before: JourneyView, after: JourneyView): string[] {
    const messages: string[] = [];
    for (const n of after.nodes) {
        const old = before.nodes.find(o => o.id === n.id);
        if (!old) {
            messages.push(n.kind === 'boss' ? 'The hidden question is revealed!' : `Discovered: ${n.title}`);
        } else if (old.status !== n.status && ['proficient', 'mastered', 'completed'].includes(n.status)) {
            messages.push(n.status === 'completed' ? 'Boss conquered. More discoveries await.' : `${n.title}: ${n.status}`);
        } else if (old) {
            if ((n.progress.advanced?.successes ?? 0) > (old.progress.advanced?.successes ?? 0)) {
                messages.push(`Advanced challenge solved · ${Math.min(n.progress.advanced!.successes, 3)}/3 toward mastery`);
            }
            for (const f of [...n.facets, 'advanced' as Facet]) {
                if (!confirmed(old.progress[f]) && confirmed(n.progress[f])) {
                    messages.push(`${FACETS[f].label} confirmed · ${n.title}`);
                } else if (old.progress[f]?.retainedAt !== n.progress[f]?.retainedAt && n.progress[f]?.retainedAt) {
                    messages.push(`${FACETS[f].label} retained · ${n.title}`);
                }
            }
        }
    }
    return messages;
}

/** Reject cycles, orphan branches, invented facets and unreachable bosses. */
export function validateJourneyPlan(value: unknown, topic: string, existing: JourneyNode[] = []): JourneyPlan {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid journey plan.');
    }
    const plan = value as JourneyPlan;
    const validText = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
    if (plan.topic !== topic || !Array.isArray(plan.nodes) || plan.nodes.length < 1 || plan.nodes.length > 17) {
        throw new Error('Invalid journey structure.');
    }
    const ids = new Set(existing.map(n => n.id));
    const normalize = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const names = new Set(existing.map(n => normalize(n.title)));
    const all = [...existing, ...plan.nodes];
    let bosses = 0;
    for (const n of plan.nodes) {
        if (!n || !/^[a-z][a-z0-9-]{0,79}$/.test(n.id) || ids.has(n.id) || !validText(n.title, 200) || names.has(normalize(n.title)) || !validText(n.definition, 1800) || !validText(n.topic, 80)
      || !['concept', 'boss'].includes(n.kind) || !Array.isArray(n.facets) || !n.facets.length || n.facets.length > 7
      || new Set(n.facets).size !== n.facets.length || n.facets.some(f => !FACET_ORDER.includes(f)) || !Array.isArray(n.requires)) {
            throw new Error('Invalid journey concept.');
        }
        if (n.kind === 'boss') {
            bosses++;
            if (n.topic !== topic || n.facets.length !== 1 || n.facets[0] !== 'mechanism') {
                throw new Error('Invalid boss dimensions or topic.');
            }
        } else {
            if (FACET_ORDER.some(f => !n.facets.includes(f))) {
                throw new Error('Concepts need all seven dimensions.');
            }
            n.facets = [...FACET_ORDER];
        }
        ids.add(n.id); names.add(normalize(n.title));
    }
    const boss = plan.nodes.find(n => n.kind === 'boss');
    if (bosses !== 1 || !boss || boss.requires.length < 2) {
        throw new Error('A proposal needs one synthesis boss with at least two prerequisites.');
    }
    const visited = new Set<string>();
    const path = new Set<string>();
    const visit = (n: JourneyNode) => {
        if (path.has(n.id)) {
            throw new Error('Journey contains a cycle.');
        }
        if (visited.has(n.id)) {
            return;
        }
        path.add(n.id);
        if (new Set(n.requires.map(r => r.nodeId)).size !== n.requires.length) {
            throw new Error('Duplicate dependency.');
        }
        for (const r of n.requires) {
            const parent = all.find(p => p.id === r.nodeId);
            if (!parent || parent.kind === 'boss' || !Array.isArray(r.facets) || !r.facets.length || new Set(r.facets).size !== r.facets.length || r.facets.length !== parent.facets.length || r.facets.some(f => !parent.facets.includes(f))) {
                throw new Error('Invalid prerequisite.');
            }
            if (plan.nodes.includes(n)) {
                r.facets = [...FACET_ORDER];
            }
            visit(parent);
        }
        // The graph edges are the dependency contract. A second generated list of
        // display names can disagree on wording or use IDs and reject a valid graph.
        // Derive this storage metadata only for new nodes; reuse never edits existing nodes.
        if (plan.nodes.includes(n)) {
            n.prerequisiteConcepts = n.requires.map(r => all.find(p => p.id === r.nodeId)!.title);
        }
        path.delete(n.id); visited.add(n.id);
    };
    visit(boss);
    if (plan.nodes.some(n => !visited.has(n.id))) {
        throw new Error('Every concept must contribute to the boss.');
    }
    return plan;
}
