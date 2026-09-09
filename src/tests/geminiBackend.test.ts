import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callGemini } from '../../supabase/functions/learning/gemini';

describe('Server Gemini requests', () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllGlobals(); vi.restoreAllMocks(); 
    });

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
        [400, 'could not process the learning request'],
    ])('explains Gemini HTTP %i without returning raw provider diagnostics', async (status, message) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Provider diagnostic' } }), { status }));
        await expect(callGemini('test-key', 'Hello')).rejects.toThrow(message);
    });

    it('recovers from a structured-output schema rejection using validated JSON mode', async () => {
        const schema = { type: 'OBJECT', properties: { nodes: { type: 'ARRAY', maxItems: 17, items: { type: 'OBJECT' } } } };
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: {
            status: 'INVALID_ARGUMENT', message: 'The specified schema produces a constraint that has too many states for serving.',
        } }), { status: 400 }));
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"nodes":[]}' }] } }] })));
        await expect(callGemini('test-key', 'Create a graph', schema)).resolves.toBe('{"nodes":[]}');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
        expect(retry.generationConfig.responseMimeType).toBe('application/json');
        expect(retry.generationConfig).not.toHaveProperty('responseSchema');
        expect(retry.contents[0].parts[0].text).toContain(JSON.stringify(schema));
        expect(retry.contents[0].parts[0].text).toContain('Create a graph');
    });

    it.each(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_SERVICE_BLOCKED'])('still identifies %s on HTTP 400 without retrying', async reason => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: {
            message: 'Authentication failure', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }],
        } }), { status: 400 }));
        await expect(callGemini('test-key', 'Create a question', { type: 'OBJECT' })).rejects.toThrow('API key was rejected');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not retry unrelated invalid requests or suggest replacing their key', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid generationConfig.temperature' } }), { status: 400 }));
        await expect(callGemini('test-key', 'Create a question', { type: 'OBJECT' })).rejects.toThrow('learning service needs an update');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('bounds schema recovery to one retry and classifies the final failure', async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'Invalid response_schema' } }), { status: 400 }));
        await expect(callGemini('test-key', 'Create a question', { type: 'OBJECT' })).rejects.toThrow('could not process the learning request');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('redacts the supplied API key from provider diagnostics', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid API key test-key' } }), { status: 400 }));
        await expect(callGemini('test-key', 'Hello')).rejects.toThrow();
        expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('test-key');
    });
});
