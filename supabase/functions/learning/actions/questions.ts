import { asObject, reject, text } from '../http.ts';
import { gameStatsForClient, questionForClient } from '../presenters.ts';
import type { ActionContext, Json } from '../types.ts';
import { savedGraph } from '../journey.ts';
import { journeyMilestones, journeyView } from '../../_shared/journey.ts';

export async function pendingReward({ db, userId }: ActionContext) {
    const { data, error } = await db.rpc('pending_learning_reward', { p_user_id: userId });
    if (error) {
        reject(500, 'Could not load your uncollected Resources.');
    }

    return { question: data ? questionForClient(asObject(data), true) : null };
}

export async function collectReward({ body, db, userId }: ActionContext) {
    const questionId = text(body.questionId);
    if (!questionId) {
        reject(400, 'Question id is required.');
    }

    const { data, error } = await db.rpc('collect_learning_reward', {
        p_user_id: userId, p_question_id: questionId,
    });
    if (error) {
        reject(409, error.message);
    }

    return { kingdom: data, reward: asObject(data).reward };
}

function answerRequest(body: Json) {
    const questionId = text(body.questionId);
    const selectedIndex = body.selectedIndex;
    const validIndex = Number.isInteger(selectedIndex) && Number(selectedIndex) >= 0 && Number(selectedIndex) <= 3;
    if (!questionId || !validIndex) {
        reject(400, 'Invalid answer.');
    }

    return { questionId, selectedIndex: Number(selectedIndex) };
}

function discoveryFor(result: Json) {
    if (!result.graph) {
        return {};
    }

    const saved = savedGraph(result.graph);
    const journey = journeyView(saved);
    const previous = journeyView({ ...saved, progress: result.previousProgress as typeof saved.progress });
    return { journey, milestones: journeyMilestones(previous, journey) };
}

function answerResponse(result: Json) {
    return {
        ...discoveryFor(result),
        question: questionForClient({ ...asObject(result.question), reward: result.reward }, true),
        stats: gameStatsForClient(result.stats),
        reward: result.reward,
        collected: result.collected,
        kingdom: result.kingdom,
    };
}

export async function answerQuestion({ body, db, userId }: ActionContext) {
    const request = answerRequest(body);
    const { data, error } = await db.rpc('record_question_answer', {
        p_user_id: userId,
        p_question_id: request.questionId,
        p_selected_index: request.selectedIndex,
    });
    if (error) {
        reject(error.message.includes('already') ? 409 : 400, error.message);
    }

    return answerResponse(asObject(data));
}

export async function deleteQuestion({ body, db, userId }: ActionContext) {
    const questionId = text(body.questionId);
    if (!questionId) {
        reject(400, 'Question id is required.');
    }

    const { error } = await db.rpc('delete_learning_question', {
        p_user_id: userId, p_question_id: questionId,
    });
    if (error) {
        throw new Error('Could not delete question.');
    }

    return { ok: true };
}

export async function resetProgress({ body, db, userId }: ActionContext) {
    if (!Number.isSafeInteger(body.generation) || Number(body.generation) < 0) {
        reject(400, 'Refresh the app before resetting progress.');
    }

    const { data, error } = await db.rpc('reset_learning_progress', {
        p_user_id: userId, p_generation: body.generation,
    });
    if (error || !data) {
        throw new Error('Could not reset progress.');
    }

    const result = asObject(data);
    return { stats: gameStatsForClient(result.stats), kingdom: result.kingdom };
}
