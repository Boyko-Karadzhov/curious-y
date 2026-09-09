import { libraryLevel, type Kingdom } from './kingdom.ts';
import { allocateResources, KNOWLEDGE_RESOURCES } from './resources.ts';
import { emptyTowers, TOWER_SCALE } from './towers.ts';

export interface LibraryConcept {
  canonicalName: string; aliases: string[]; mastery: string; isAtomic?: boolean;
  reasoningTrack: Record<string, number>;
  topics?: Record<string, number>;
}
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

// Connected identities collapse transitive aliases and duplicate canonical rows.
// An atomic identity anywhere in the group conservatively excludes the group.
export function qualifyingConcepts<T extends LibraryConcept>(concepts: readonly T[]): T[] {
    const parents = concepts.map((_, i) => i);
    const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
    const names = new Map<string, number>();
    concepts.forEach((c, i) => {
        for (const name of [c.canonicalName, ...c.aliases].map(normalize).filter(Boolean)) {
            const previous = names.get(name);
            if (previous !== undefined) parents[root(i)] = root(previous);
            names.set(name, i);
        }
    });
    const groups = new Map<number, { atomic: boolean; earned: T[] }>();
    concepts.forEach((c, i) => {
        const group = groups.get(root(i)) ?? { atomic: false, earned: [] };
        group.atomic ||= !!c.isAtomic;
        if (['proficient', 'mastered'].includes(c.mastery) && Object.values(c.reasoningTrack).some(n => n > 0)) group.earned.push(c);
        groups.set(root(i), group);
    });
    const key = (c: T) => [normalize(c.canonicalName), c.canonicalName, JSON.stringify(KNOWLEDGE_RESOURCES.map(r => c.topics?.[r.topic] ?? 0))].join('\0');
    return [...groups.values()].filter(g => g.earned.length && !g.atomic)
        .map(g => g.earned.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)[0]);
}
export const qualifyingConceptCount = (concepts: readonly LibraryConcept[]) => qualifyingConcepts(concepts).length;

// Demo only; live progress is reconciled in SQL from protected concepts.
export function reconcileLibrary(state: Kingdom, concepts: readonly LibraryConcept[]): Kingdom {
    const eligible = qualifyingConcepts(concepts), towers = emptyTowers();
    for (const c of eligible) {
    // Unclassified historical concepts remain in Library; never invent a topic.
        const fallback = KNOWLEDGE_RESOURCES.find(r => Number.isFinite(c.topics?.[r.topic]) && c.topics![r.topic] > 0)?.topic;
        if (!fallback) continue;
        for (const line of allocateResources(TOWER_SCALE, c.topics, fallback)) towers.points[line.key] += line.amount;
    }
    const count = eligible.length;
    if (state.libraryConcepts === count && state.buildings.library === libraryLevel(count) && JSON.stringify(state.towers) === JSON.stringify(towers)) return state;
    return { ...state, towers, libraryConcepts: count, buildings: { ...state.buildings, library: libraryLevel(count) } };
}
