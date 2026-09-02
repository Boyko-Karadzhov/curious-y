import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_SUBTOPIC_EXPLORATIONS,
  generateGenericSubtopics,
  getOrGenerateSubtopics,
  preloadCustomSubtopics,
} from '../lib/llm/subtopics';
import { getCachedSubtopics, cacheSubtopicsForTopic } from '../services/database';
import { UserSettings } from '../types';

describe('Subtopics Exploration & Caching System', () => {
  const testUserId = 'test-subtopics-user-123';

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('provides rich default subtopics for the 8 canonical topics from insights.md', () => {
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Physics'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Mathematics & Logic'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Chemistry'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Life'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Computer Science'].length).toBeGreaterThanOrEqual(12);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Earth & Space'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Mind & Behavior'].length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Society & History'].length).toBeGreaterThanOrEqual(10);
  });

  it('resolves subtopics for topic strings and aliases', () => {
    const customTopic = 'Astrophysics & Black Holes';
    const subtopics = generateGenericSubtopics(customTopic);
    expect(subtopics.length).toBeGreaterThanOrEqual(10);
    expect(subtopics).toEqual(DEFAULT_SUBTOPIC_EXPLORATIONS['Earth & Space']);
  });

  it('persists and retrieves cached subtopics in localStorage', () => {
    const customTopic = 'Quantum Cryptography';
    const customList = [
      'BB84 protocol (quantum key distribution, no-cloning theorem)',
      'E91 protocol (entanglement, Bell inequality violation)',
      'Post-quantum cryptography (lattice-based, Shor algorithm implications)',
    ];

    cacheSubtopicsForTopic(testUserId, customTopic, customList);
    const cached = getCachedSubtopics(testUserId);
    expect(cached[customTopic]).toEqual(customList);
    expect(cached[customTopic.toLowerCase()]).toEqual(customList);
  });

  it('returns default catalog without API call for standard topics', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
    };

    const subtopics = await getOrGenerateSubtopics(settings, 'Physics', testUserId, false);
    expect(subtopics).toEqual(DEFAULT_SUBTOPIC_EXPLORATIONS['Physics']);
  });

  it('returns canonical or cached subtopics when querying topics', async () => {
    const customTopic = 'Macroeconomics';
    const settings: UserSettings = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test-key-mock',
    };

    const mockSubtopics = [
      'Monetary policy & interest rates (IS-LM model, central banking, quantitative easing)',
      'Inflation & unemployment dynamics (Phillips curve, stagflation, wage-price spirals)',
      'Fiscal policy & government debt (Keynesian multiplier, crowding-out effect, Ricardian equivalence)',
      'International trade & exchange rates (Purchasing Power Parity, balance of payments, currency floats)',
    ];

    // Pre-cache custom subtopics
    cacheSubtopicsForTopic(testUserId, customTopic, mockSubtopics);

    const subtopics = await getOrGenerateSubtopics(settings, customTopic, testUserId, false);
    expect(subtopics).toEqual(mockSubtopics);

    // Verify it was persisted in cache
    const cached = getCachedSubtopics(testUserId);
    expect(cached[customTopic]).toEqual(mockSubtopics);
  });

  it('preloads custom subtopics in background without throwing', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
    };

    await expect(
      preloadCustomSubtopics(settings, ['Neuroscience', 'Topology'], testUserId, true)
    ).resolves.not.toThrow();

    const cached = getCachedSubtopics(testUserId);
    expect(cached['Neuroscience']).toBeDefined();
    expect(cached['Topology']).toBeDefined();
  });
});
