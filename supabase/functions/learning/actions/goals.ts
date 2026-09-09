import { reject } from '../http.ts';
import type { ActionContext } from '../types.ts';

export async function getGoal({ db, userId }: ActionContext) {
    const { data, error } = await db.rpc('get_progression_goal', { p_user_id: userId });
    if (error || !data) {
        throw new Error('Could not load your saved goal. Please retry.');
    }

    return data;
}

export async function setGoal({ body, db, userId }: ActionContext) {
    if (!Object.prototype.hasOwnProperty.call(body, 'goal') || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) {
        reject(400, 'Invalid progression goal.');
    }

    const { data, error } = await db.rpc('set_progression_goal', {
        p_user_id: userId, p_goal: body.goal, p_revision: body.revision,
    });
    if (error?.code === '40001') {
        reject(409, error.message);
    }

    if (error?.code === '22023') {
        reject(400, 'Invalid progression goal.');
    }

    if (error || !data) {
        throw new Error('Could not save your goal. Please retry.');
    }

    return data;
}
