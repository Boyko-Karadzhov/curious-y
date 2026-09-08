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
  title: string;
  /** Author context, never revealed before answering. */
  definition: string;
  facets: Facet[];
  requires: Requirement[];
  kind: 'concept' | 'boss';
  /** Explicit semantic dependencies, checked against graph edges or earned prior knowledge. */
  prerequisiteConcepts?: string[];
}
export interface JourneyPlan { title: string; topic: string; nodes: JourneyNode[]; priorKnowledge?: { name: string; entries: Partial<Record<Facet, FacetProgress>> }[] }
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
export interface SavedJourney { id: string; chapter: number; plan: JourneyPlan; progress: JourneyProgress }
export interface VisibleNode extends Omit<JourneyNode, 'definition'> {
  progress: Partial<Record<Facet, FacetProgress>>;
  status: 'discovered' | 'exploring' | 'proficient' | 'mastered' | 'completed';
  rusty: boolean;
}
export interface JourneyView {
  chapters?: { id: string; chapter: number }[];
  id: string; chapter: number; topic: string; title: string;
  nodes: VisibleNode[];
  frontiers: { id: string; from: string[]; ready: number; total: number; contributions: Requirement[] }[];
  complete: boolean;
}
export interface JourneyTarget { journeyId: string; nodeId: string; facet: Facet }
export const confirmed = (p?: FacetProgress) => (p?.successes ?? 0) >= 2;
export function nodeAvailable(node: JourneyNode, progress: JourneyProgress): boolean {
  return node.requires.every(r => r.facets.every(f => confirmed(progress[r.nodeId]?.[f])));
}
export const proficient = (node: Pick<JourneyNode, 'facets'>, progress: Partial<Record<Facet, FacetProgress>> = {}) => node.facets.every(f => confirmed(progress[f]));
export const reviewDue = (p?: FacetProgress, now = Date.now()) => confirmed(p) && now >= (p?.nextReviewAt ? Date.parse(p.nextReviewAt) : Date.parse(p?.lastSuccessAt ?? '') + 86400000);
export function nodeStatus(node: Omit<JourneyNode, 'definition'>, progress: JourneyProgress): VisibleNode['status'] {
  const p = progress[node.id] ?? {};
  if (proficient(node, p)) {
    if (node.kind === 'boss') return 'completed';
    return (p.advanced?.successes ?? 0) >= 3 ? 'mastered' : 'proficient';
  }
  return node.facets.some(f => p[f]?.attempts) ? 'exploring' : 'discovered';
}
export function journeyView(saved: SavedJourney): JourneyView {
  const visible = saved.plan.nodes.filter(n => nodeAvailable(n, saved.progress));
  const ids = new Set(visible.map(n => n.id));
  return {
    id: saved.id, chapter: saved.chapter, title: saved.plan.title, topic: saved.plan.topic,
    nodes: visible.map(({ definition: _private, ...n }) => ({ ...n, progress: saved.progress[n.id] ?? {}, status: nodeStatus(n, saved.progress), rusty: [...n.facets, 'advanced' as Facet].some(f => reviewDue(saved.progress[n.id]?.[f])) })),
    // No hidden titles, definitions, facets, or boss flags cross this boundary.
    frontiers: saved.plan.nodes.filter(n => !ids.has(n.id) && n.requires.some(r => ids.has(r.nodeId))).map((n, index) => ({
      id: `frontier-${index}`, from: n.requires.filter(r => ids.has(r.nodeId)).map(r => r.nodeId),
      contributions: n.requires.filter(r => ids.has(r.nodeId)),
      ready: n.requires.filter(r => r.facets.every(f => confirmed(saved.progress[r.nodeId]?.[f]))).length,
      total: n.requires.length,
    })),
    complete: saved.plan.nodes.filter(n => n.kind === 'boss').every(n => nodeStatus(n, saved.progress) === 'completed'),
  };
}
export function nextFacet(node: Pick<VisibleNode, 'facets' | 'progress'> & { kind?: JourneyNode['kind'] }, now = Date.now()): Facet {
  return node.facets.find(f => !confirmed(node.progress[f]))
    ?? node.facets.find(f => reviewDue(node.progress[f], now))
    ?? (node.kind === 'concept' ? 'advanced' : undefined)
    ?? [...node.facets].sort((a, b) => (node.progress[a]?.attempts ?? 0) - (node.progress[b]?.attempts ?? 0))[0];
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
    if (!old) messages.push(n.kind === 'boss' ? 'The hidden question is revealed!' : `Discovered: ${n.title}`);
    else if (old.status !== n.status && ['proficient', 'mastered', 'completed'].includes(n.status)) {
      messages.push(n.status === 'completed' ? 'Boss conquered. A new chapter awaits.' : `${n.title}: ${n.status}`);
    } else if (old) {
      if ((n.progress.advanced?.successes ?? 0) > (old.progress.advanced?.successes ?? 0)) messages.push(`Advanced challenge solved · ${Math.min(n.progress.advanced!.successes, 3)}/3 toward mastery`);
      for (const f of [...n.facets, 'advanced' as Facet]) {
        if (!confirmed(old.progress[f]) && confirmed(n.progress[f])) messages.push(`${FACETS[f].label} confirmed · ${n.title}`);
        else if (old.progress[f]?.retainedAt !== n.progress[f]?.retainedAt && n.progress[f]?.retainedAt) messages.push(`${FACETS[f].label} retained · ${n.title}`);
      }
    }
  }
  return messages;
}

/** Reject cycles, orphan branches, invented facets and unreachable bosses. */
export function validateJourneyPlan(value: unknown, topic: string): JourneyPlan {
  if (!value || typeof value !== 'object') throw new Error('Invalid journey plan.');
  const plan = value as JourneyPlan;
  const validText = (s: unknown, max: number) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  if (!validText(plan.title, 90) || plan.topic !== topic || !Array.isArray(plan.nodes) || plan.nodes.length < 4 || plan.nodes.length > 10) throw new Error('Invalid journey structure.');
  const ids = new Set<string>();
  const names = new Set<string>();
  let bosses = 0;
  for (const n of plan.nodes) {
    if (!n || !/^[a-z][a-z0-9-]{0,39}$/.test(n.id) || ids.has(n.id) || !validText(n.title, 200) || names.has(n.title.toLowerCase()) || !validText(n.definition, 1800)
      || !['concept', 'boss'].includes(n.kind) || !Array.isArray(n.facets) || !n.facets.length || n.facets.length > 7
      || new Set(n.facets).size !== n.facets.length || n.facets.some(f => !FACET_ORDER.includes(f)) || !Array.isArray(n.requires)) throw new Error('Invalid journey concept.');
    if (n.kind === 'boss') bosses++;
    else if (FACET_ORDER.some(f => !n.facets.includes(f))) throw new Error('Concepts need all seven dimensions.');
    ids.add(n.id); names.add(n.title.toLowerCase());
  }
  const boss = plan.nodes.find(n => n.kind === 'boss');
  if (bosses !== 1 || !boss || boss.requires.length < 2 || plan.nodes.filter(n => !n.requires.length).length < 2) throw new Error('A journey needs accessible roots and a synthesis boss.');
  const visited = new Set<string>();
  const path = new Set<string>();
  const visit = (n: JourneyNode) => {
    if (path.has(n.id)) throw new Error('Journey contains a cycle.');
    if (visited.has(n.id)) return;
    path.add(n.id);
    if (new Set(n.requires.map(r => r.nodeId)).size !== n.requires.length) throw new Error('Duplicate dependency.');
    for (const r of n.requires) {
      const parent = plan.nodes.find(p => p.id === r.nodeId);
      if (!parent || parent.kind === 'boss' || !Array.isArray(r.facets) || !r.facets.length || new Set(r.facets).size !== r.facets.length || r.facets.length !== parent.facets.length || r.facets.some(f => !parent.facets.includes(f))) throw new Error('Invalid prerequisite.');
      visit(parent);
    }
    const prerequisites = n.requires.map(r => plan.nodes.find(p => p.id === r.nodeId)!.title);
    const declared = n.prerequisiteConcepts ?? prerequisites;
    if (!Array.isArray(declared) || declared.some(name => !prerequisites.includes(name) && !plan.priorKnowledge?.some(p => p.name === name)) || prerequisites.some(name => !declared.includes(name))) throw new Error('Every declared prerequisite needs a graph edge or earned prior knowledge.');
    path.delete(n.id); visited.add(n.id);
  };
  visit(boss);
  if (visited.size !== plan.nodes.length) throw new Error('Every concept must contribute to the boss.');
  return plan;
}
