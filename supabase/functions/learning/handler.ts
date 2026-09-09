import { asObject, corsHeaders, HttpError, jsonResponse, parseBody, reject, text } from './http.ts';
import type { ActionContext, Dependencies } from './types.ts';
import { getGoal, setGoal } from './actions/goals.ts';
import { deleteKey, getKeyStatus, saveKey, validateKey } from './actions/keys.ts';
import { getKingdom, runKingdomCommand } from './actions/kingdomActions.ts';
import { answerQuestion, collectReward, deleteQuestion, pendingReward, resetProgress } from './actions/questions.ts';
import { chat } from './actions/chat.ts';
import { journey } from './actions/journeys.ts';
import { generate } from './actions/generation.ts';

type ActionHandler = (context: ActionContext) => Promise<unknown>;

const handlers: Record<string, ActionHandler> = {
    goal: getGoal,
    set_goal: setGoal,
    kingdom: getKingdom,
    kingdom_command: runKingdomCommand,
    key_status: getKeyStatus,
    save_key: saveKey,
    delete_key: deleteKey,
    validate_key: validateKey,
    journey_question: journey,
    knowledge_graph: journey,
    journey_practice: journey,
    generate,
    pending_reward: pendingReward,
    collect_reward: collectReward,
    answer: answerQuestion,
    chat,
    delete_question: deleteQuestion,
    reset: resetProgress,
};

function configuration(dependencies: Dependencies): { anonKey: string; serviceKey: string; url: string } {
    const url = dependencies.env.get('SUPABASE_URL');
    const anonKey = dependencies.env.get('SUPABASE_ANON_KEY');
    const serviceKey = dependencies.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey) {
        console.error('Missing required Edge Function secrets');
        reject(503, 'The learning backend is not configured.');
    }

    return { anonKey: anonKey!, serviceKey: serviceKey!, url: url! };
}

async function authenticatedUser(request: Request, dependencies: Dependencies, url: string, anonKey: string) {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) {
        reject(401, 'Authentication required.');
    }

    const client = dependencies.createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    const user = asObject(asObject(data).user);
    if (error || !user.id) {
        reject(401, 'Invalid or expired session.');
    }

    return user.id as string;
}

async function enforceRequestLimit(context: ActionContext) {
    const { data, error } = await context.db.rpc('consume_backend_rate_limit', {
        p_user_id: context.userId, p_action: 'all_requests',
        p_max_requests: 360, p_window_seconds: 60,
    });
    if (error || !data) {
        reject(429, 'Please wait before trying again.');
    }
}

async function dispatch(context: ActionContext) {
    const action = text(context.body.action);
    if (action === 'upgrade' || action === 'claim_daily') {
        reject(410, 'This legacy economy action has been retired. Refresh the app to use your Castle.');
    }

    const handler = handlers[action];
    if (!handler) {
        reject(400, 'Unknown action.');
    }

    return handler(context);
}

async function handlePost(request: Request, dependencies: Dependencies) {
    const config = configuration(dependencies);
    const userId = await authenticatedUser(request, dependencies, config.url, config.anonKey);
    const db = dependencies.createClient(config.url, config.serviceKey, { auth: { persistSession: false } });
    const body = await parseBody(request);
    const context = { body, db, dependencies, userId };
    await enforceRequestLimit(context);
    return jsonResponse(await dispatch(context));
}

function errorResponse(error: unknown) {
    if (error instanceof HttpError) {
        return jsonResponse({ error: error.message }, error.status);
    }

    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    return jsonResponse({ error: message }, 500);
}

export function createLearningHandler(dependencies: Dependencies) {
    return async (request: Request) => {
        if (request.method === 'OPTIONS') {
            return new Response('ok', { headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return jsonResponse({ error: 'Method not allowed' }, 405);
        }

        try {
            return await handlePost(request, dependencies);
        } catch (error) {
            return errorResponse(error);
        }
    };
}
