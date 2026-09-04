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
 * Atomic leaves are assumed mastered and automatically satisfy prerequisite proficiency.
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
    if (!prereq.isAtomic && prereq.mastery !== 'proficient' && prereq.mastery !== 'mastered') {
      return false;
    }
  }

  return true;
}

/**
 * Finds all concept names that are transitive prerequisites (ancestors)
 * of any concept in the given root list.
 */
export function getTransitivePrerequisiteNames(rootConcepts: Concept[], registry: Concept[]): Set<string> {
  const result = new Set<string>();
  const queue: string[] = [];

  for (const c of rootConcepts) {
    if (c.prerequisites) {
      for (const p of c.prerequisites) {
        queue.push(p);
      }
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const norm = current.trim().toLowerCase();
    if (!result.has(norm)) {
      result.add(norm);
      const found = findConcept(current, registry);
      if (found && found.prerequisites) {
        for (const p of found.prerequisites) {
          queue.push(p);
        }
      }
    }
  }

  return result;
}

/**
 * Returns concepts for which the user is at least proficient for all prerequisites,
 * and the concept itself is not yet mastered (i.e. currently unseen, learning, or proficient).
 * We keep asking questions until concepts are fully mastered.
 *
 * Atomic leaves are assumed mastered and are NEVER questioned (never eligible).
 *
 * When topic is provided:
 * 1. Checks if any non-mastered concepts directly matching topic have their prerequisites met.
 * 2. If concepts in topic exist but their prerequisites are not yet proficient, includes the
 *    eligible prerequisite concepts in the topic's dependency tree so the user can unlock the topic.
 */
export function getEligibleConcepts(registry: Concept[], topic?: string): Concept[] {
  const nonMastered = registry.filter(
    (c) => !c.isAtomic && c.mastery !== 'mastered'
  );

  const eligible = nonMastered.filter((c) => areAllPrerequisitesProficient(c, registry));

  if (!topic) {
    return eligible;
  }

  const normTopic = topic.trim().toLowerCase();

  // Directly matching topic
  const directEligible = eligible.filter((c) => {
    if (!c.topics) return false;
    return Object.keys(c.topics).some(
      (t) => t.trim().toLowerCase() === normTopic && (c.topics[t] ?? 0) > 0
    );
  });

  if (directEligible.length > 0) {
    return directEligible;
  }

  // If no concepts directly in this topic are eligible yet, check if there are concepts
  // in this topic that are waiting on prerequisites in other domains (e.g. Physics for Earth & Space).
  const directTopicConcepts = registry.filter((c) => {
    if (!c.topics) return false;
    return Object.keys(c.topics).some(
      (t) => t.trim().toLowerCase() === normTopic && (c.topics[t] ?? 0) > 0
    );
  });

  if (directTopicConcepts.length > 0) {
    const prereqNames = getTransitivePrerequisiteNames(directTopicConcepts, registry);
    const prereqEligible = eligible.filter((c) =>
      prereqNames.has(c.canonicalName.trim().toLowerCase()) ||
      (c.aliases && c.aliases.some((a) => prereqNames.has(a.trim().toLowerCase())))
    );
    if (prereqEligible.length > 0) {
      return prereqEligible;
    }
  }

  return [];
}

/**
 * Checks if there are no concepts or all concepts are fully mastered.
 * Atomic leaves are assumed mastered.
 * Proficient is not enough; we keep asking concept questions until mastered.
 * In this condition (empty or all mastered), a Boss Question should be generated.
 */
export function isAllConceptsMasteredOrEmpty(registry: Concept[]): boolean {
  if (registry.length === 0) {
    return true;
  }
  return registry.every((c) => c.isAtomic || c.mastery === 'mastered');
}

/**
 * Backward-compatible alias for isAllConceptsMasteredOrEmpty.
 */
export const isAllConceptsProficientOrEmpty = isAllConceptsMasteredOrEmpty;

/**
 * Selects an eligible concept to base the next question on.
 * Leans towards in-progress (learning) concepts or concepts not yet asked.
 * Atomic leaves are never selected.
 */
export function selectConceptForQuestion(
  registry: Concept[],
  topic?: string
): Concept | null {
  const eligible = getEligibleConcepts(registry, topic);
  const candidates = eligible.filter((c) => !c.isAtomic);
  if (candidates.length === 0) {
    return null;
  }

  // If a topic was requested, prefer concepts directly tagged with this topic if available
  if (topic) {
    const normTopic = topic.trim().toLowerCase();
    const directlyInTopic = candidates.filter(
      (c) =>
        c.topics &&
        Object.keys(c.topics).some(
          (t) => t.trim().toLowerCase() === normTopic && (c.topics[t] ?? 0) > 0
        )
    );
    if (directlyInTopic.length > 0) {
      const learning = directlyInTopic.filter((c) => c.mastery === 'learning');
      const pool = learning.length > 0 ? learning : directlyInTopic;
      return pool[Math.floor(Math.random() * pool.length)];
    }
  }

  // Prioritize concepts that are currently in 'learning' state, then 'unseen'
  const learning = candidates.filter((c) => c.mastery === 'learning');
  const pool = learning.length > 0 ? learning : candidates;

  // Pick one with least total track count or least recently asked
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Returns the primary topic for a concept (the topic with the highest weight).
 * If multiple topics exist, sorts by weight descending.
 */
export function getPrimaryTopic(topics?: Record<string, number>, fallback = 'Physics'): string {
  if (!topics || Object.keys(topics).length === 0) return fallback;
  const sorted = Object.entries(topics).sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}
