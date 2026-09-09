import { asObject, reject, stringArray, text } from '../http.ts';
import { questionForClient } from '../presenters.ts';
import { generationPrompt } from '../generationPrompt.ts';
import { QUESTION_SCHEMA, TOPICS } from '../questionSchema.ts';
import type { RegistryConcept } from '../prerequisites.ts';
import type { ActionContext, Json } from '../types.ts';
import { getStoredGeminiKey } from './keys.ts';

type Reservation = {
    active?: Json;
    generation: number;
    lease: string;
};

const selectedTopic = (requested: unknown) => {
    const topic = text(requested);
    return (TOPICS as readonly string[]).includes(topic)
        ? topic
        : TOPICS[Math.floor(Math.random() * TOPICS.length)];
};

async function enforceLimit(context: ActionContext, action: string, maximum: number, seconds: number, message: string) {
    const { data, error } = await context.db.rpc('consume_backend_rate_limit', {
        p_user_id: context.userId, p_action: action,
        p_max_requests: maximum, p_window_seconds: seconds,
    });
    if (error || !data) {
        reject(429, message);
    }
}

async function reserveGeneration(context: ActionContext, topic: string) {
    const { data, error } = await context.db.rpc('begin_question_generation', {
        p_user_id: context.userId, p_topic: topic,
    });
    if (error || !data) {
        reject(409, error?.message || 'Could not reserve a question.');
    }

    return data as Reservation;
}

async function loadPages<T>(load: (offset: number, pageSize: number) => Promise<T[]>) {
    const items: T[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
        const page = await load(offset, pageSize);
        items.push(...page);
        if (page.length < pageSize) {
            break;
        }
    }

    return items;
}

async function loadConceptPage(context: ActionContext, offset: number, pageSize: number) {
    const { data, error } = await context.db.from('concepts')
        .select('canonical_name,definition,mastery,aliases,prerequisites,is_atomic,topics,reasoning_track,reward_successes,next_due_at')
        .eq('user_id', context.userId).order('canonical_name').range(offset, offset + pageSize - 1);
    if (error || !data) {
        throw new Error('Could not load your concept progress. Please try again.');
    }

    return Array.isArray(data) ? data as RegistryConcept[] : [];
}

async function loadQuestionPage(context: ActionContext, offset: number, pageSize: number) {
    const { data, error } = await context.db.from('questions').select('question_text')
        .eq('user_id', context.userId).order('created_at', { ascending: false })
        .order('id').range(offset, offset + pageSize - 1);
    if (error || !data) {
        throw new Error('Could not load your question history. Please try again.');
    }

    return Array.isArray(data) ? data.map(item => asObject(item).question_text as string) : [];
}

async function generationInputs(context: ActionContext) {
    const concepts = await loadPages<RegistryConcept>((offset, size) => loadConceptPage(context, offset, size));
    await enforceLimit(context, 'generate', 6, 60, 'Please wait a moment before generating another question.');
    await enforceLimit(context, 'generation_daily', 120, 86400, 'Your daily question limit has been reached. Please return tomorrow.');
    const history = await loadPages<string>((offset, size) => loadQuestionPage(context, offset, size));
    return { concepts, history };
}

function validateGeneratedQuestion(generated: Json) {
    const options = stringArray(generated.options, 4);
    const correctIndex = generated.correctIndex;
    const invalidText = !text(generated.question) || text(generated.question).length > 8000
        || !text(generated.explanation) || text(generated.explanation).length > 16000;
    const invalidAnswer = typeof correctIndex !== 'number' || !Number.isInteger(correctIndex)
        || correctIndex < 0 || correctIndex > 3;
    if (options.length !== 4 || options.some(option => option.length > 2000) || invalidText || invalidAnswer) {
        throw new Error('The AI service returned an invalid question.');
    }

    return { generated, options, correctIndex };
}

async function generateQuestion(context: ActionContext, topic: string, concepts: RegistryConcept[], history: string[]) {
    const key = await getStoredGeminiKey(context);
    const prompt = generationPrompt(topic, concepts, history);
    const generate = async (candidatePrompt: string) =>
        asObject(JSON.parse(await context.dependencies.callGemini(key, candidatePrompt, QUESTION_SCHEMA)));
    const generated = await context.dependencies.generateEligibleQuestion(generate, prompt, concepts, topic, history);
    return validateGeneratedQuestion(generated);
}

function questionRecord(context: ActionContext, topic: string, candidate: ReturnType<typeof validateGeneratedQuestion>) {
    const { generated, options, correctIndex } = candidate;
    const shuffled = context.dependencies.shuffleQuestionOptions({ options, correctIndex });
    const concept = generated.concept;
    return {
        user_id: context.userId,
        topic,
        subtopic: text(generated.subtopic, concept as string),
        angle: text(generated.angle),
        angle_fit: text(generated.angleFit),
        question_text: text(generated.question),
        options: shuffled.options,
        correct_index: shuffled.correctIndex,
        explanation: text(generated.explanation),
        suggested_questions: stringArray(generated.suggestedQuestions, 4),
        concept,
        topic_weights: generated.topicWeights,
        concept_definition: text(generated.conceptDefinition, `A core concept in ${topic}.`),
        reasoning_complexity: generated.reasoningComplexity,
        is_boss_question: Boolean(generated.isBossQuestion),
        required_concepts: generated.requiredConcepts,
        prerequisites_met: generated.eligible,
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
}

async function persistQuestion(context: ActionContext, topic: string, reservation: Reservation, inputs: Awaited<ReturnType<typeof generationInputs>>) {
    const candidate = await generateQuestion(context, topic, inputs.concepts, inputs.history);
    const { data, error } = await context.db.rpc('finish_question_generation', {
        p_user_id: context.userId, p_lease: reservation.lease,
        p_generation: reservation.generation,
        p_question: questionRecord(context, topic, candidate),
    });
    if (error || !data) {
        throw error ?? new Error('Could not save generated question.');
    }

    return { question: questionForClient(asObject(data)) };
}

async function releaseGeneration(context: ActionContext, reservation: Reservation) {
    const { error } = await context.db.rpc('cancel_question_generation', {
        p_user_id: context.userId, p_lease: reservation.lease,
    });
    if (error) {
        console.error('Could not release question reservation');
    }
}

async function completeGeneration(context: ActionContext, topic: string, reservation: Reservation) {
    try {
        const inputs = await generationInputs(context);
        return await persistQuestion(context, topic, reservation, inputs);
    } finally {
        await releaseGeneration(context, reservation);
    }
}

export async function generate(context: ActionContext) {
    const topic = selectedTopic(context.body.topic);
    await enforceLimit(context, 'generate_requests', 12, 60, 'Please wait before generating another question.');
    const reservation = await reserveGeneration(context, topic);
    if (reservation.active) {
        return { question: questionForClient(reservation.active) };
    }

    return completeGeneration(context, topic, reservation);
}
