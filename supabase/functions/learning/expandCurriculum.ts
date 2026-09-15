import type { JourneyNode, LearningGraph } from '../_shared/journey.ts';
import { createBoss, expandNode, type CurriculumExpansion } from './curriculum.ts';
import { rateGeneration, type LearningContext } from './learningContext.ts';

type ExpansionLease = {
    lease: string;
    graph: LearningGraph & { generation: number }
};

export async function expandCurriculum(context: LearningContext, graph: LearningGraph & { generation: number }, topic: string, target?: JourneyNode) {
    const reservation = await context.rpc<ExpansionLease>('begin_graph_expansion', {
        p_topic: topic,
        p_generation: graph.generation
    });
    try {
        return await prepareStage(context, reservation, topic, target?.id);
    } finally {
        await context.rpc('cancel_question_generation', { p_lease: reservation.lease });
    }
}

async function prepareStage(context: LearningContext, reservation: ExpansionLease, topic: string, targetId?: string) {
    await rateGeneration(context.rpc, true);
    const key = await context.getKey();
    const target = reservation.graph.nodes.find(node => node.id === targetId);
    const expansion = target ? await expandNode(key, target, reservation.graph)
        : await createBoss(key, topic, reservation.graph);
    await saveExpansion(context, reservation, topic, expansion);
    return {
        preparing: true as const,
        topic,
        generation: reservation.graph.generation,
        targetNodeId: expansion.targetId
    };
}

async function saveExpansion(context: LearningContext, reservation: ExpansionLease, topic: string,
    expansion: CurriculumExpansion): Promise<void> {
    await context.rpc('save_generated_nodes', {
        p_topic: topic,
        p_lease: reservation.lease,
        p_generation: reservation.graph.generation,
        p_root: expansion.rootId,
        p_nodes: expansion.nodes,
        p_target: expansion.targetId
    });
}
