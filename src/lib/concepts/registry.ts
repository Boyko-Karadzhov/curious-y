import { Concept } from '../../types';

/**
 * Normalizes a string for loose comparison (lowercase, trimmed, normalized whitespace).
 */
export function normalizeConceptString(str: string): string {
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Finds a concept in the registry by exact canonical name or any alias (case-insensitive).
 */
export function findConcept(name: string, registry: Concept[]): Concept | undefined {
    const normalized = normalizeConceptString(name);
    if (!normalized) {
        return undefined;
    }

    const ordered = [...registry].sort((a,b) => a.canonicalName < b.canonicalName ? -1 : a.canonicalName > b.canonicalName ? 1 : 0);
    return ordered.find(c => c.canonicalName === name.trim())
    ?? ordered.find(c => normalizeConceptString(c.canonicalName) === normalized)
    ?? ordered.find(c => c.aliases?.some(a => normalizeConceptString(a) === normalized));
}
