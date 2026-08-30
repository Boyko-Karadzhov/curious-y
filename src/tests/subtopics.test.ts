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

  it('provides rich default subtopics for default topics', () => {
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Physics'].length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Chemistry'].length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Calculus'].length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['Algebra'].length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_SUBTOPIC_EXPLORATIONS['History'].length).toBeGreaterThanOrEqual(8);
  });

  it('generates high quality generic fallback subtopics for any custom topic string', () => {
    const customTopic = 'Astrophysics & Black Holes';
    const subtopics = generateGenericSubtopics(customTopic);
    expect(subtopics.length).toBeGreaterThanOrEqual(8);
    expect(subtopics[0]).toContain(customTopic);
    expect(subtopics.some((s) => s.includes('paradoxes'))).toBe(true);
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
      topics: 'Physics',
    };

    const subtopics = await getOrGenerateSubtopics(settings, 'Physics', testUserId, false);
    expect(subtopics).toEqual(DEFAULT_SUBTOPIC_EXPLORATIONS['Physics']);
  });

  it('caches generated subtopics when exploring custom topics', async () => {
    const customTopic = 'Macroeconomics';
    const settings: UserSettings = {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-test-key-mock',
      topics: 'Macroeconomics',
    };

    const mockSubtopics = [
      'Monetary policy & interest rates (IS-LM model, central banking, quantitative easing)',
      'Inflation & unemployment dynamics (Phillips curve, stagflation, wage-price spirals)',
      'Fiscal policy & government debt (Keynesian multiplier, crowding-out effect, Ricardian equivalence)',
      'International trade & exchange rates (Purchasing Power Parity, balance of payments, currency floats)',
    ];

    // Mock fetch for LLM response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ subtopics: mockSubtopics }),
            },
          },
        ],
      }),
    } as unknown as Response);

    const subtopics = await getOrGenerateSubtopics(settings, customTopic, testUserId, false);
    expect(subtopics).toEqual(mockSubtopics);

    // Verify it was persisted to user's cache
    const cached = getCachedSubtopics(testUserId);
    expect(cached[customTopic]).toEqual(mockSubtopics);

    // Second call should return directly from cache without calling fetch
    const fetchCallCount = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const secondCall = await getOrGenerateSubtopics(settings, customTopic, testUserId, false);
    expect(secondCall).toEqual(mockSubtopics);
    expect((global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallCount);
  });

  it('preloads custom subtopics in background without throwing', async () => {
    const settings: UserSettings = {
      provider: 'gemini',
      model: 'gemini-3.7-flash',
      apiKey: '',
      topics: 'Neuroscience, Topology',
    };

    await expect(
      preloadCustomSubtopics(settings, ['Neuroscience', 'Topology'], testUserId, true)
    ).resolves.not.toThrow();

    const cached = getCachedSubtopics(testUserId);
    expect(cached['Neuroscience']).toBeDefined();
    expect(cached['Topology']).toBeDefined();
  });
});
