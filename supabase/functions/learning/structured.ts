import { callGemini, type GeminiProfile } from './gemini.ts';

export const stringSchema = { type: 'STRING' };
export const stringsSchema = {
    type: 'ARRAY',
    items: stringSchema
};
export const objectSchema = (properties: Record<string, unknown>) => ({
    type: 'OBJECT',
    properties,
    required: Object.keys(properties)
});
export const nonempty = (value: unknown, max = 6000): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
// JSON can decode unescaped LaTeX commands (e.g. \rho, \text) into control characters.
// eslint-disable-next-line no-control-regex -- Detect corrupted math while allowing LF and CRLF paragraphs.
const brokenMarkdownEscapes = /[\u0000-\u0009\u000B\u000C\u000E-\u001F]|\r(?!\n)/u;
export const validMarkdown = (value: unknown, max: number): value is string =>
    nonempty(value, max) && !brokenMarkdownEscapes.test(value);

const MAX_ATTEMPTS = 3;

/** Retry this prompt when Gemini returns JSON that does not pass its validator. */
export async function structured<T>(key: string, prompt: string, schema: Record<string, unknown>, validate: (value: unknown) => T,
    constrained = true, profile: GeminiProfile = 'standard'): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const candidate = await callGemini(key, prompt, schema, constrained, profile);
        try {
            return validate(JSON.parse(candidate));
        } catch {
            // A fresh sample of the same prompt can recover malformed or semantically invalid output.
        }
    }

    throw new Error('We could not prepare valid learning material. Your progress is saved. Please retry.');
}
