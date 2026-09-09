// Model choice is an application decision, never a client-controlled parameter.
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

type Json = Record<string, unknown>;

function providerFailure(detail: string) {
    try {
        const error = JSON.parse(detail)?.error;
        return {
            message: typeof error?.message === 'string' ? error.message : '',
            reasons: Array.isArray(error?.details) ? error.details.map((item: Json) => item.reason).filter((reason: unknown): reason is string => typeof reason === 'string') : [],
        };
    } catch {
        return { message: '', reasons: [] as string[] };
    }
}

export async function callGemini(apiKey: string, prompt: string, schema?: Json) {
    const request = (constrained: boolean) => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
        {
            method: 'POST',
            signal: AbortSignal.timeout(25000),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: schema && !constrained
                    ? `${prompt}\nReturn only JSON matching this schema: ${JSON.stringify(schema)}`
                    : prompt }] }],
                generationConfig: schema ? {
                    maxOutputTokens: 4096,
                    temperature: 0.85,
                    responseMimeType: 'application/json',
                    ...(constrained ? { responseSchema: schema } : {}),
                } : { temperature: 0.65, maxOutputTokens: 2048 },
            }),
        },
    );

    let response = await request(true);
    let detail = response.ok ? '' : await response.text();
    let failure = providerFailure(detail);
    const rejectedKey = () => failure.reasons.some((reason: string) => reason.startsWith('API_KEY_'))
    || /api key (?:not valid|is invalid|is expired|has expired|was reported as leaked)/i.test(failure.message);
    // Gemini can reject otherwise valid schemas when its constrained decoder is
    // too complex. JSON mode still supplies the complete shape to the model;
    // callers validate the result before saving a graph or serving a question.
    if (schema && response.status === 400 && !rejectedKey()
    && /response[_ ]?schema|json schema|schema.*(?:complex|states|nest|support)|too many states/i.test(failure.message)) {
        console.warn('Gemini rejected the response schema; retrying once in JSON mode.');
        response = await request(false);
        detail = response.ok ? '' : await response.text();
        failure = providerFailure(detail);
    }

    if (!response.ok) {
        console.error('Gemini request failed', response.status, detail.split(apiKey).join('[redacted]').slice(0, 500));
        if (response.status === 404) {
            throw new Error('The configured Gemini model is unavailable. The app administrator needs to update the learning service model.');
        }

        if (response.status === 429) {
            throw new Error('Gemini’s request limit or quota has been reached. Wait a moment and retry, or check your quota in Google AI Studio.');
        }

        if ([401, 403].includes(response.status) || rejectedKey()) {
            throw new Error('The Gemini API key was rejected. Check the key and its API access.');
        }

        if (response.status === 400) {
            throw new Error('Gemini could not process the learning request. Please retry. If this continues, the learning service needs an update.');
        }

        throw new Error('Gemini is temporarily unable to complete this request. Please try again shortly.');
    }

    const payload = await response.json();
    const output = payload.candidates?.[0]?.content?.parts?.map((part: Json) => part.text ?? '').join('').trim();
    if (!output) {
        throw new Error('The AI service returned an empty response.');
    }

    return output;
}

