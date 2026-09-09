import { reject, text } from '../http.ts';
import type { ActionContext, KingdomCommand } from '../types.ts';
import type { CommandContext } from '../kingdom.ts';

type CommandRequest = {
    command: KingdomCommand;
    generation: number;
    requestId: string;
};

export async function getKingdom({ db, userId }: ActionContext) {
    const { data, error } = await db.rpc('kingdom_snapshot', { p_user_id: userId });
    if (error || !data) {
        throw new Error('Could not load your Castle.');
    }

    return { kingdom: data };
}

function parsedCommand(context: ActionContext): KingdomCommand {
    try {
        return context.dependencies.parseKingdomCommand(context.body.command);
    } catch (error) {
        return reject(400, error instanceof Error ? error.message : 'Invalid command.');
    }
}

function commandRequest(context: ActionContext): CommandRequest {
    const command = parsedCommand(context);
    const requestId = text(context.body.requestId);
    const generation = context.body.generation;
    const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId);
    if (!validId || !Number.isSafeInteger(generation) || Number(generation) < 0) {
        reject(400, 'Invalid command identity.');
    }

    return { command, requestId, generation: Number(generation) };
}

async function findPrior(context: ActionContext, request: CommandRequest) {
    const { data, error } = await context.db.rpc('find_kingdom_command', {
        p_user_id: context.userId, p_request_id: request.requestId,
        p_generation: request.generation, p_command: request.command,
    });
    if (error) {
        reject(409, error.message);
    }

    return data;
}

async function reserveCommand(context: ActionContext, request: CommandRequest) {
    const { data, error } = await context.db.rpc('reserve_kingdom_command', {
        p_user_id: context.userId, p_request_id: request.requestId,
        p_generation: request.generation, p_command: request.command,
    });
    if (error) {
        reject(409, error.message);
    }

    return data as { draws: number[] };
}

async function loadCommandContext(context: ActionContext, request: CommandRequest) {
    const { data, error } = await context.db.rpc('kingdom_command_context', {
        p_user_id: context.userId, p_generation: request.generation,
    });
    if (error || !data) {
        reject(409, error?.message || 'Castle not found.');
    }

    return data as CommandContext;
}

function executeCommand(
    context: ActionContext,
    request: CommandRequest,
    state: CommandContext,
    draws: number[],
): ReturnType<ActionContext['dependencies']['executeKingdomCommand']> {
    try {
        return context.dependencies.executeKingdomCommand(state, request.command, { requestId: request.requestId, draws });
    } catch (error) {
        return reject(400, error instanceof Error ? error.message : 'Command rejected.');
    }
}

async function commitCommand(context: ActionContext, request: CommandRequest, current: CommandContext, next: ReturnType<ActionContext['dependencies']['executeKingdomCommand']>) {
    const { data, error } = await context.db.rpc('commit_kingdom_command', {
        p_user_id: context.userId, p_generation: request.generation, p_revision: current.revision,
        p_request_id: request.requestId, p_command: request.command,
        p_state: next.state, p_battle_clock: next.battleClock,
    });
    if (error) {
        reject(409, error.message);
    }

    return data;
}

async function commitWithRetry(context: ActionContext, request: CommandRequest, draws: number[]) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = await loadCommandContext(context, request);
        const next = executeCommand(context, request, current, draws);
        const committed = await commitCommand(context, request, current, next);
        if (committed) {
            return committed;
        }
    }

    reject(503, 'Castle changed; please retry.');
}

export async function runKingdomCommand(context: ActionContext) {
    const request = commandRequest(context);
    const prior = await findPrior(context, request);
    if (prior) {
        return { kingdom: prior };
    }

    const reservation = await reserveCommand(context, request);
    const committed = await commitWithRetry(context, request, reservation.draws);
    return { kingdom: committed };
}
