import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateServerQuestion, getServerGeminiKeyStatus } from '../services/backend';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke } } }));

function httpFailure(status: number, body: string) {
  invoke.mockResolvedValue({ data: null, error: {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(body, { status }),
  } });
}

describe('Learning backend error recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a missing-key error from an older deployed function', async () => {
    httpFailure(500, JSON.stringify({ error: 'A valid Gemini API key is required. Add it in Settings.' }));
    await expect(generateServerQuestion('Physics')).rejects.toMatchObject({
      needsApiKey: true, message: expect.stringContaining('Add your Gemini API key in Settings'),
    });
  });

  it('offers key recovery for a rejected key', async () => {
    httpFailure(500, JSON.stringify({ error: 'The Gemini API key was rejected. Check the key and its API access.' }));
    await expect(generateServerQuestion()).rejects.toMatchObject({ needsApiKey: true, message: expect.stringContaining('check or replace') });
  });

  it('explains gateway authentication failures without blaming the key', async () => {
    httpFailure(401, JSON.stringify({ code: 401, message: 'Invalid JWT' }));
    await expect(generateServerQuestion()).rejects.toMatchObject({ needsApiKey: false, message: expect.stringContaining('Sign out and sign in') });
  });

  it('keeps the backend rate-limit recovery message', async () => {
    httpFailure(429, JSON.stringify({ error: 'Please wait a moment before generating another question.' }));
    await expect(generateServerQuestion()).rejects.toMatchObject({ needsApiKey: false, message: 'Please wait a moment before generating another question.' });
  });

  it('handles HTML gateway errors without leaking markup or SDK jargon', async () => {
    httpFailure(502, '<html>Bad gateway</html>');
    await expect(generateServerQuestion()).rejects.toMatchObject({ needsApiKey: false, message: expect.stringContaining('Check your connection') });
  });

  it('handles transport failures while checking key status', async () => {
    invoke.mockResolvedValue({ error: new Error('Failed to send a request to the Edge Function') });
    await expect(getServerGeminiKeyStatus()).rejects.toThrow('We could not reach the learning service');
  });

  it('does not confuse missing backend configuration with a missing personal key', async () => {
    httpFailure(503, JSON.stringify({ error: 'The learning backend is not configured.' }));
    await expect(generateServerQuestion()).rejects.toMatchObject({ needsApiKey: false, message: expect.stringContaining('app administrator') });
  });
});
