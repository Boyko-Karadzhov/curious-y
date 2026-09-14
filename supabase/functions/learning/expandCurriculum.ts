import type { JourneyNode, LearningGraph } from '../_shared/journey.ts';
import { advanceCurriculum, conceptDraft, newDraft, type CurriculumDraft } from './curriculum.ts';
import { rateGeneration, type LearningContext } from './learningContext.ts';

type DraftLease = {
    lease: string;
    draft: CurriculumDraft | null;
    graph: LearningGraph & { generation: number }
};
export async function expandCurriculum(context: LearningContext, graph: LearningGraph & { generation: number }, topic: string, target?: JourneyNode) {
    const reservation = await context.rpc<DraftLease>('begin_curriculum_stage', {
        p_topic: topic,
        p_generation: graph.generation
    });
    try {
        return await prepareStage(context, reservation, topic, target);
    } finally {
        await context.rpc('cancel_question_generation', { p_lease: reservation.lease });
    }
}

async function prepareStage(context: LearningContext, reservation: DraftLease, topic: string, target?: JourneyNode) {
    await rateGeneration(context.rpc, true);
    const key = await context.getKey();
    const saved = reservation.draft ?? (target ? conceptDraft(topic, target) : newDraft(topic));
    const draft = await advanceCurriculum(key, saved, reservation.graph);
    await context.rpc('save_curriculum_stage', {
        p_topic: topic,
        p_lease: reservation.lease,
        p_generation: reservation.graph.generation,
        p_draft: draft,
    });
    return {
        preparing: true as const,
        topic,
        generation: reservation.graph.generation,
        targetNodeId: draft.targetId
    };
}
