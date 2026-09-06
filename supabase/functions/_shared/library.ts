import { libraryLevel, type Kingdom } from './kingdom.ts';

export interface LibraryConcept {
  canonicalName: string; aliases: string[]; mastery: string; isAtomic?: boolean;
  reasoningTrack: Record<string, number>;
}
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

// Connected identities collapse transitive aliases and duplicate canonical rows.
// An atomic identity anywhere in the group conservatively excludes the group.
export function qualifyingConceptCount(concepts: readonly LibraryConcept[]): number {
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
  const groups = new Map<number, { atomic: boolean; earned: boolean }>();
  concepts.forEach((c, i) => {
    const group = groups.get(root(i)) ?? { atomic: false, earned: false };
    group.atomic ||= !!c.isAtomic;
    group.earned ||= ['proficient', 'mastered'].includes(c.mastery) && Object.values(c.reasoningTrack).some(n => n > 0);
    groups.set(root(i), group);
  });
  return [...groups.values()].filter(g => g.earned && !g.atomic).length;
}

// Demo only; live progress is reconciled in SQL from protected concepts.
export function reconcileLibrary(state: Kingdom, concepts: readonly LibraryConcept[]): Kingdom {
  const count = qualifyingConceptCount(concepts);
  if (state.libraryConcepts === count && state.buildings.library === libraryLevel(count)) return state;
  return { ...state, libraryConcepts: count, buildings: { ...state.buildings, library: libraryLevel(count) } };
}
