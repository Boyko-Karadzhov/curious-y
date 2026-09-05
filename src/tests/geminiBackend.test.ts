import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '../../supabase/functions/learning/gemini';

describe('Server Gemini requests', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('uses Flash-Lite for connection tests and structured questions', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] })));
    await expect(callGemini('test-key', 'Reply with exactly: OK')).resolves.toBe('OK');
    const schema = { type: 'OBJECT', properties: { question: { type: 'STRING' } } };
    await callGemini('test-key', 'Create a question', schema);
    for (const [url, request] of fetchMock.mock.calls) {
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
      expect(request.headers['x-goog-api-key']).toBe('test-key');
    }
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: schema });
  });

  it.each([
    [404, 'configured Gemini model is unavailable'],
    [429, 'request limit or quota has been reached'],
    [503, 'temporarily unable'],
    [403, 'API key was rejected'],
  ])('explains Gemini HTTP %i without returning raw provider diagnostics', async (status, message) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Provider diagnostic' } }), { status }));
    await expect(callGemini('test-key', 'Hello')).rejects.toThrow(message);
  });
});
