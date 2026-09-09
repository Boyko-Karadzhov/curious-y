import { asObject, reject, text } from '../http.ts';
import type { ActionContext, Json } from '../types.ts';
import { getStoredGeminiKey } from './keys.ts';

type ChatRequest = {
    message: string;
    questionId: string;
};

function chatRequest(context: ActionContext): ChatRequest {
    const questionId = text(context.body.questionId);
    const message = text(context.body.message).slice(0, 2000);
    if (!questionId || !message) {
        reject(400, 'A question and message are required.');
    }

    return { message, questionId };
}

async function enforceChatRateLimit(context: ActionContext) {
    const { data: allowed } = await context.db.rpc('consume_backend_rate_limit', {
        p_user_id: context.userId, p_action: 'chat', p_max_requests: 20, p_window_seconds: 60,
    });
    if (!allowed) {
        reject(429, 'Please wait a moment before sending another message.');
    }
}

async function loadQuestion(context: ActionContext, request: ChatRequest) {
    const { data } = await context.db.from('questions').select('*')
        .eq('id', request.questionId).eq('user_id', context.userId)
        .not('answered_at', 'is', null).maybeSingle();
    if (!data) {
        reject(404, 'Answered question not found.');
    }

    return asObject(data);
}

async function loadHistory(context: ActionContext, request: ChatRequest) {
    const { data } = await context.db.from('chat_messages').select('role,content')
        .eq('question_id', request.questionId).eq('user_id', context.userId)
        .order('created_at').limit(20);
    return Array.isArray(data) ? data.map(asObject) : [];
}

async function saveUserMessage(context: ActionContext, request: ChatRequest) {
    const { error } = await context.db.from('chat_messages').insert({
        question_id: request.questionId, user_id: context.userId,
        role: 'user', content: request.message,
    });
    if (error) {
        throw new Error('Could not save your message.');
    }
}

function tutorPrompt(question: Json, history: Json[], message: string) {
    const transcript = history.map(item => `${item.role}: ${item.content}`).join('\n');
    return `You are a concise, encouraging tutor. Help the learner reason from the supplied question and explanation. Do not claim they chose a different answer than the stored selection.

Question: ${question.question_text}
Options: ${JSON.stringify(question.options)}
Correct option: ${question.correct_index}
Explanation: ${question.explanation}

Conversation:
${transcript || '(none)'}
user: ${message}
assistant:`;
}

async function saveReply(context: ActionContext, request: ChatRequest, reply: string) {
    const { data, error } = await context.db.from('chat_messages').insert({
        question_id: request.questionId, user_id: context.userId,
        role: 'assistant', content: reply,
    }).select('*').single();
    if (error || !data) {
        throw error ?? new Error('Could not save tutor reply.');
    }

    return asObject(data);
}

const chatMessage = (saved: Json) => ({
    id: saved.id,
    questionId: saved.question_id,
    userId: saved.user_id,
    role: saved.role,
    content: saved.content,
    createdAt: saved.created_at,
});

export async function chat(context: ActionContext) {
    const request = chatRequest(context);
    await enforceChatRateLimit(context);
    const question = await loadQuestion(context, request);
    const history = await loadHistory(context, request);
    const key = await getStoredGeminiKey(context);
    await saveUserMessage(context, request);
    const reply = await context.dependencies.callGemini(key, tutorPrompt(question, history, request.message));
    const saved = await saveReply(context, request, reply);
    return { message: chatMessage(saved) };
}
