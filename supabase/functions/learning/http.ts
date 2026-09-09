import type { Json } from './types.ts';

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

const combineChunks = (chunks: Uint8Array[], size: number) => {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }

    return bytes;
};

type BodyAccumulator = { chunks: Uint8Array[]; size: number };

async function appendChunk(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    state: BodyAccumulator,
    value: Uint8Array,
) {
    const size = state.size + value.length;
    if (size > 8192) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large.');
    }

    state.chunks.push(value);
    return { ...state, size };
}

async function readChunks(reader: ReadableStreamDefaultReader<Uint8Array>, state: BodyAccumulator): Promise<BodyAccumulator> {
    const { value, done } = await reader.read();
    if (done) {
        return state;
    }

    const next = await appendChunk(reader, state, value);
    return readChunks(reader, next);
}

const readBoundedBody = async (request: Request) => {
    const reader = request.body?.getReader();
    if (!reader) {
        return new Uint8Array();
    }

    const body = await readChunks(reader, { chunks: [], size: 0 });
    return combineChunks(body.chunks, body.size);
};

export async function parseBody(request: Request): Promise<Json> {
    const bytes = await readBoundedBody(request);
    try {
        return asObject(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
        throw new HttpError(400, 'Invalid JSON.');
    }
}

export const asObject = (value: unknown): Json =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};

export const text = (value: unknown, fallback = '') =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;

export const stringArray = (value: unknown, max = 12) =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim()).slice(0, max)
        : [];

export const reject = (status: number, message: string): never => {
    throw new HttpError(status, message);
};
