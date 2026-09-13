import type { Facet, JourneyNode } from '../_shared/journey.ts';
import { savedGraph, rateGeneration, type LearningContext } from './learningContext.ts';
import { journeyQuestionPrompt } from './questionPrompt.ts';
import { questionSchema, shuffledQuestion, validateJourneyQuestion, validateQuestionContent, type QuestionContent } from './questionContent.ts';
import { structured } from './structured.ts';

type Reservation = { active?: Record<string, unknown>; graph: unknown; node: JourneyNode; lease: string; generation: number };
async function prepareQuestion(context: LearningContext, reservation: Reservation, facet: Facet): Promise<QuestionContent> {
    const node = reservation.node;
    if (node.kind === 'boss') {
        return validateQuestionContent(node.curriculum?.assessment);
    }

    await rateGeneration(context.rpc);
    const graph = savedGraph(reservation.graph);
    const plan = { topic: node.topic, nodes: graph.nodes };
    const history = await context.rpc<string[]>('graph_question_history');
    const prompt = journeyQuestionPrompt(plan, node, facet, graph.progress, history);
    return structured(await context.getKey(), prompt, questionSchema, value => validateJourneyQuestion(value, plan, node, graph.progress, history));
}

async function finishQuestion(context: LearningContext, reservation: Reservation, facet: Facet) {
    const question = await prepareQuestion(context, reservation, facet);
    const storedEntry = reservation.node.curriculum?.dimensions?.[facet];
    const row = await context.rpc('finish_graph_question', {
        p_node: reservation.node.id, p_facet: facet, p_lease: reservation.lease, p_generation: reservation.generation,
        p_question: shuffledQuestion({ ...question, knowledgeEntry: storedEntry ?? question.knowledgeEntry }),
    });
    return { questionRow: row };
}

export async function issueQuestion(context: LearningContext, nodeId: string, facet: Facet) {
    const reservation = await context.rpc<Reservation>('begin_graph_question', { p_node: nodeId, p_facet: facet });
    if (reservation.active) {
        return { questionRow: reservation.active };
    }

    try {
        return await finishQuestion(context, reservation, facet);
    } finally {
        await context.rpc('cancel_question_generation', { p_lease: reservation.lease });
    }
}
