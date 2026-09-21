// Model choice is an application decision, never a client-controlled parameter.
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const KNOWLEDGE_MODEL = 'gemini-3.8-flash';
export type GeminiProfile = 'standard' | 'knowledge';
const GEMINI_TIMEOUT_MS = 60000;

type Json = Record<string, unknown>;
type Failure = {
    message: string;
    reasons: string[]
};
type Attempt = {
    response: Response;
    detail: string;
    failure: Failure
};

function providerFailure(detail: string): Failure {
    try {
        const error = JSON.parse(detail)?.error;
        return {
            message: typeof error?.message === 'string' ? error.message : '',
            reasons: Array.isArray(error?.details)
                ? error.details.map((item: Json) => item.reason).filter((reason: unknown): reason is string => typeof reason === 'string')
                : [],
        };
    } catch {
        return {
            message: '',
            reasons: []
        };
    }
}

function requestBody(prompt: string, schema: Json | undefined, constrained: boolean, profile: GeminiProfile): string {
    const text = schema && !constrained ? `${prompt}\nReturn only JSON matching this schema: ${JSON.stringify(schema)}` : prompt;
    const generationConfig = schema
        ? {
            maxOutputTokens: profile === 'knowledge' ? 16384 : 8192,
            temperature: 0.85,
            responseMimeType: 'application/json',
            ...(constrained ? { responseSchema: schema } : {})
        }
        : {
            temperature: 0.65,
            maxOutputTokens: 2048
        };
    return JSON.stringify({
        contents: [{
            role: 'user',
            parts: [{ text }]
        }],
        generationConfig
    });
}

async function requestGemini(apiKey: string, prompt: string, schema: Json | undefined, constrained: boolean, profile: GeminiProfile): Promise<Attempt> {
    const response = await fetchGemini(apiKey, prompt, schema, constrained, profile);
    const detail = response.ok ? '' : await response.text();
    return {
        response,
        detail,
        failure: providerFailure(detail)
    };
}

async function fetchGemini(apiKey: string, prompt: string, schema: Json | undefined, constrained: boolean, profile: GeminiProfile): Promise<Response> {
    const model = profile === 'knowledge' ? KNOWLEDGE_MODEL : GEMINI_MODEL;
    try {
        return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: 'POST',
            signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: requestBody(prompt, schema, constrained, profile),
        });
    } catch (error) {
        throw readableNetworkError(error);
    }
}

function readableNetworkError(error: unknown): Error {
    const failure = error && typeof error === 'object' ? error as {
        name?: unknown;
        message?: unknown
    } : {};
    if (failure.name === 'TimeoutError' || (typeof failure.message === 'string' && /signal timed out/i.test(failure.message))) {
        return new Error('Gemini took too long to generate this learning material. Your progress is saved; please retry.');
    }

    return error instanceof Error ? error : new Error('Gemini could not be reached. Please check your connection and retry.');
}

function rejectedKey(failure: Failure): boolean {
    return failure.reasons.some(reason => reason.startsWith('API_KEY_'))
        || /api key (?:not valid|is invalid|is expired|has expired|was reported as leaked)/i.test(failure.message);
}

function throwProviderError(attempt: Attempt, apiKey: string): never {
    const { response, detail, failure } = attempt;
    console.error('Gemini request failed', response.status, detail.split(apiKey).join('[redacted]').slice(0, 500));
    if (response.status === 404) {
        throw new Error('The configured Gemini model is unavailable. The app administrator needs to update the learning service model.');
    }

    if (response.status === 429) {
        throw new Error('Gemini’s request limit or quota has been reached. Wait a moment and retry, or check your quota in Google AI Studio.');
    }

    if ([401, 403].includes(response.status) || rejectedKey(failure)) {
        throw new Error('The Gemini API key was rejected. Check the key and its API access.');
    }

    if (response.status === 400) {
        throw new Error('Gemini could not process the learning request. Please retry. If this continues, the learning service needs an update.');
    }

    throw new Error('Gemini is temporarily unable to complete this request. Please try again shortly.');
}

async function responseText(response: Response): Promise<string> {
    const payload = await response.json();
    const candidate = payload.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
        console.warn('Gemini output limit reached', payload.usageMetadata);
        throw new Error('Gemini stopped before finishing the learning material. Your progress is saved; please retry.');
    }

    const output = candidate?.content?.parts?.map((part: Json) => part.text ?? '').join('').trim();
    if (!output) {
        throw new Error('The AI service returned an empty response.');
    }

    return output;
}

export async function callGemini(apiKey: string, prompt: string, schema?: Json, constrained = true, profile: GeminiProfile = 'standard'): Promise<string> {
    const attempt = await requestGemini(apiKey, prompt, schema, constrained, profile);
    if (!attempt.response.ok) {
        throwProviderError(attempt, apiKey);
    }

    return responseText(attempt.response);
}
