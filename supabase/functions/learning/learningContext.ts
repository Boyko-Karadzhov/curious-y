import type { LearningGraph } from '../_shared/journey.ts';
type Json = Record<string, unknown>;
export interface Database { rpc(name: string, args: Json): PromiseLike<{ data: unknown; error: { message: string } | null }> }
export type Rpc = <T = Json>(name: string, args?: Json) => Promise<T>;
export type LearningContext = { rpc: Rpc; getKey: () => Promise<string> };
export const savedGraph = (row: unknown): LearningGraph & { generation: number } => {
    const graph = row as LearningGraph & { generation: number };
    if (!graph || !Array.isArray(graph.nodes) || !graph.progress || !Number.isSafeInteger(graph.generation)) {
        throw new Error('Could not read your knowledge graph.');
    }

    return graph;
};

export function createRpc(db: Database, userId: string): Rpc {
    return async <T = Json>(name: string, args: Json = {}): Promise<T> => {
        const { data, error } = await db.rpc(name, { p_user_id: userId, ...args });
        if (error) {
            throw new Error(error.message);
        }

        return data as T;
    };
}

export const loadGraph = async (rpc: Rpc) => savedGraph(await rpc('load_learning_graph'));

export async function rateGeneration(rpc: Rpc, curriculum = false): Promise<void> {
    const action = curriculum ? 'curriculum_stage' : 'journey_generation';
    if (!await rpc('consume_backend_rate_limit', { p_action: action, p_max_requests: curriculum ? 60 : 6, p_window_seconds: 60 })) {
        throw new Error('Please wait a moment before generating more learning material.');
    }

    if (!await rpc('consume_backend_rate_limit', { p_action: curriculum ? 'curriculum_daily' : 'generation_daily', p_max_requests: curriculum ? 1200 : 120, p_window_seconds: 86400 })) {
        throw new Error('Your daily generation limit has been reached. Please return tomorrow.');
    }
}
