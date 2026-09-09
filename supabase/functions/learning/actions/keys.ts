import { reject, text } from '../http.ts';
import type { ActionContext } from '../types.ts';

export function validateGeminiKey(key: string) {
    if (!key || key.length < 10 || key.length > 512) {
        throw new Error('A valid Gemini API key is required. Add it in Settings.');
    }

    return key;
}

export async function getStoredGeminiKey({ db, userId }: ActionContext) {
    const { data, error } = await db.rpc('get_user_gemini_key', { p_user_id: userId });
    if (error) {
        throw new Error('Could not read the saved Gemini API key.');
    }

    return validateGeminiKey(typeof data === 'string' ? data.trim() : '');
}

async function enforceKeyRateLimit(context: ActionContext, action: string, message: string) {
    const { data: allowed } = await context.db.rpc('consume_backend_rate_limit', {
        p_user_id: context.userId, p_action: action, p_max_requests: 5, p_window_seconds: 60,
    });
    if (!allowed) {
        reject(429, message);
    }
}

export async function getKeyStatus({ db, userId }: ActionContext) {
    const { data, error } = await db.from('user_ai_settings').select('user_id')
        .eq('user_id', userId).maybeSingle();
    if (error) {
        throw new Error('Could not read Gemini key status.');
    }

    return { configured: Boolean(data) };
}

export async function saveKey(context: ActionContext) {
    await enforceKeyRateLimit(context, 'save_key', 'Please wait before changing the key again.');
    const key = validateGeminiKey(text(context.body.apiKey));
    await context.dependencies.callGemini(key, 'Reply with exactly: OK');
    const { error } = await context.db.rpc('set_user_gemini_key', {
        p_user_id: context.userId, p_api_key: key,
    });
    if (error) {
        throw new Error('Could not securely save the Gemini API key.');
    }

    return { configured: true };
}

export async function deleteKey({ db, userId }: ActionContext) {
    const { error } = await db.rpc('delete_user_gemini_key', { p_user_id: userId });
    if (error) {
        throw new Error('Could not remove the Gemini API key.');
    }

    return { configured: false };
}

export async function validateKey(context: ActionContext) {
    await enforceKeyRateLimit(context, 'validate_key', 'Please wait before testing the key again.');
    const provided = text(context.body.apiKey);
    const key = provided ? validateGeminiKey(provided) : await getStoredGeminiKey(context);
    const reply = await context.dependencies.callGemini(key, 'Reply with exactly: OK');
    if (!reply) {
        throw new Error('Gemini returned an empty response.');
    }

    return { ok: true };
}
