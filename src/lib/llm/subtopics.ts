import { UserSettings, TOPICS, TopicName } from '../../types';
import { getCachedSubtopics, cacheSubtopicsForTopic } from '../../services/database';

import { DEFAULT_SUBTOPIC_EXPLORATIONS } from '../../../supabase/functions/_shared/subtopics';
export { DEFAULT_SUBTOPIC_EXPLORATIONS };

/**
 * Maps any legacy, alias, or raw topic string into its canonical TopicName.
 */
export function mapToCanonicalTopic(rawTopic: string): TopicName {
    const trimmed = rawTopic.trim().toLowerCase();
    if (!trimmed) {
        return 'Physics';
    }

    // Exact match
    const exact = TOPICS.find((t) => t.toLowerCase() === trimmed);
    if (exact) {
        return exact;
    }

    // Aliases for backwards compatibility & migrations
    if (
        trimmed.includes('earth') ||
    trimmed.includes('space') ||
    trimmed.includes('astro') ||
    trimmed.includes('geology') ||
    trimmed.includes('planet')
    ) {
        return 'Earth & Space';
    }

    if (
        trimmed.includes('math') ||
    trimmed.includes('logic') ||
    trimmed.includes('algebra') ||
    trimmed.includes('calculus')
    ) {
        return 'Mathematics & Logic';
    }

    if (trimmed.includes('chem')) {
        return 'Chemistry';
    }

    if (trimmed.includes('life') || trimmed.includes('bio')) {
        return 'Life';
    }

    if (
        trimmed.includes('comput') ||
    trimmed.includes('cs') ||
    trimmed.includes('code') ||
    trimmed.includes('software') ||
    trimmed.includes('programming')
    ) {
        return 'Computer Science';
    }

    if (
        trimmed.includes('mind') ||
    trimmed.includes('behavior') ||
    trimmed.includes('psych') ||
    trimmed.includes('cognit') ||
    trimmed.includes('neuro')
    ) {
        return 'Mind & Behavior';
    }

    if (
        trimmed.includes('histor') ||
    trimmed.includes('societ') ||
    trimmed.includes('politi') ||
    trimmed.includes('warhammer') ||
    trimmed.includes('heresy')
    ) {
        return 'Society & History';
    }

    if (trimmed.includes('physic')) {
        return 'Physics';
    }

    return 'Physics';
}

/**
 * Resolves a topic string to its canonical topic name and returns its fixed subtopics.
 */
export function getSubtopicsForTopic(topic: string): string[] {
    const canonical = mapToCanonicalTopic(topic);
    return DEFAULT_SUBTOPIC_EXPLORATIONS[canonical] || DEFAULT_SUBTOPIC_EXPLORATIONS['Physics'];
}

/**
 * Fallback generator for subtopics for any topic string.
 */
export function generateGenericSubtopics(topic: string): string[] {
    return getSubtopicsForTopic(topic);
}

/**
 * Retrieves subtopics from default catalog or user cache.
 */
export async function getOrGenerateSubtopics(
    _settings?: UserSettings,
    topic: string = 'Physics',
    userId?: string,
    _isDemoUser?: boolean
): Promise<string[]> {
    if (userId) {
        const cached = getCachedSubtopics(userId);
        if (cached[topic] && cached[topic].length > 0) {
            return cached[topic];
        }

        if (cached[topic.toLowerCase()] && cached[topic.toLowerCase()].length > 0) {
            return cached[topic.toLowerCase()];
        }
    }

    return getSubtopicsForTopic(topic);
}

/**
 * Preload subtopics into local cache if needed.
 */
export async function preloadCustomSubtopics(
    _settings?: UserSettings,
    topics: string[] = [],
    userId?: string,
    _isDemoUser?: boolean
): Promise<void> {
    if (userId && topics.length > 0) {
        for (const t of topics) {
            const subtopics = getSubtopicsForTopic(t);
            cacheSubtopicsForTopic(userId, t, subtopics);
        }
    }

    return Promise.resolve();
}
