import { asObject } from '../http.ts';
import { questionForClient } from '../presenters.ts';
import type { ActionContext } from '../types.ts';
import { getStoredGeminiKey } from './keys.ts';

export async function journey(context: ActionContext) {
    const getKey = () => getStoredGeminiKey(context);
    const result = await context.dependencies.handleJourney(
        context.db, context.userId, context.body, getKey,
    );
    return 'questionRow' in result
        ? { question: questionForClient(asObject(result.questionRow)) }
        : result;
}
