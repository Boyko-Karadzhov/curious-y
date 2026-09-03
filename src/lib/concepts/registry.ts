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
  if (!normalized) return undefined;

  return registry.find((c) => {
    if (normalizeConceptString(c.canonicalName) === normalized) {
      return true;
    }
    if (c.aliases && Array.isArray(c.aliases)) {
      return c.aliases.some((a) => normalizeConceptString(a) === normalized);
    }
    return false;
  });
}

/**
 * Canonicalizes a concept name against the user's concept registry.
 * If a matching concept exists (by canonical name or alias), returns its canonicalName.
 * Otherwise returns the original trimmed name.
 */
export function canonicalizeConceptName(name: string, registry: Concept[]): string {
  const matched = findConcept(name, registry);
  return matched ? matched.canonicalName : name.trim();
}

/**
 * Checks if the user is at least proficient (proficient or mastered)
 * for ALL of a concept's prerequisites.
 *
 * If the concept has no prerequisites, returns true.
 */
export function areAllPrerequisitesProficient(concept: Concept, registry: Concept[]): boolean {
  if (!concept.prerequisites || concept.prerequisites.length === 0) {
    return true;
  }

  for (const prereqName of concept.prerequisites) {
    const prereq = findConcept(prereqName, registry);
    if (!prereq) {
      return false;
    }
    if (prereq.mastery !== 'proficient' && prereq.mastery !== 'mastered') {
      return false;
    }
  }

  return true;
}

/**
 * Returns concepts for which the user is at least proficient for all prerequisites,
 * and the concept itself is not yet proficient/mastered (i.e. currently unseen or learning).
 */
export function getEligibleConcepts(registry: Concept[], topic?: string): Concept[] {
  const nonProficient = registry.filter(
    (c) => c.mastery !== 'proficient' && c.mastery !== 'mastered'
  );

  const eligible = nonProficient.filter((c) => areAllPrerequisitesProficient(c, registry));

  if (!topic) {
    return eligible;
  }

  const normTopic = topic.trim().toLowerCase();
  return eligible.filter((c) => {
    if (!c.topics) return false;
    return Object.keys(c.topics).some(
      (t) => t.trim().toLowerCase() === normTopic && (c.topics[t] ?? 0) > 0
    );
  });
}

/**
 * Checks if there are no concepts or all concepts are at least proficient.
 * In this condition, a Boss Question should be generated.
 */
export function isAllConceptsProficientOrEmpty(registry: Concept[]): boolean {
  if (registry.length === 0) {
    return true;
  }
  return registry.every((c) => c.mastery === 'proficient' || c.mastery === 'mastered');
}

/**
 * Selects an eligible concept to base the next question on.
 * Leans towards in-progress (learning) concepts or concepts not yet asked.
 */
export function selectConceptForQuestion(
  registry: Concept[],
  topic?: string
): Concept | null {
  const eligible = getEligibleConcepts(registry, topic);
  if (eligible.length === 0) {
    return null;
  }

  // Prioritize concepts that are currently in 'learning' state, then 'unseen'
  const learning = eligible.filter((c) => c.mastery === 'learning');
  const pool = learning.length > 0 ? learning : eligible;

  // Pick one with least total track count or least recently asked
  return pool[Math.floor(Math.random() * pool.length)];
}
