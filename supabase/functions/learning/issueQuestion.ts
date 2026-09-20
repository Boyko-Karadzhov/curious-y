import type { JourneyNode, JourneyTarget } from '../_shared/journey.ts';
import { rateGeneration, type LearningContext } from './learningContext.ts';
import { journeyQuestionPrompt } from './questionPrompt.ts';
import { questionSchema, shuffledQuestion, validateJourneyQuestion, validateQuestionStructure, type QuestionContent } from './questionContent.ts';
import { structured } from './structured.ts';

type Reservation = {
    active?: Record<string, unknown>;
    node: JourneyNode;
    lease: string;
    generation: number
};
async function prepareQuestion(context: LearningContext, reservation: Reservation, target: JourneyTarget): Promise<QuestionContent> {
    const node = reservation.node;
    if (node.kind === 'boss') {
        if (target.kind !== 'boss') {
            throw new Error('Bosses use the boss question target.');
        }

        return validateQuestionStructure(node.bossQuestion);
    }

    if (target.kind === 'boss') {
        throw new Error('Concepts use dimension or reasoning targets.');
    }

    await rateGeneration(context.rpc);
    const history = await context.rpc<string[]>('graph_question_history');
    const prompt = journeyQuestionPrompt(node, target);
    return structured(await context.getKey(), prompt, questionSchema, value => validateJourneyQuestion(value, history), true, 'knowledge');
}

async function finishQuestion(context: LearningContext, reservation: Reservation, target: JourneyTarget) {
    const question = await prepareQuestion(context, reservation, target);
    const storedEntry = reservation.node.kind === 'concept' && target.kind === 'dimension'
        ? reservation.node.dimensions[target.dimension] : undefined;
    const row = await context.rpc('finish_graph_question', {
        p_node: reservation.node.id,
        p_dimension: target.kind === 'dimension' ? target.dimension : null,
        p_reasoning: target.kind === 'reasoning' ? target.reasoningComplexity : null,
        p_lease: reservation.lease,
        p_generation: reservation.generation,
        p_question: shuffledQuestion(question, storedEntry),
    });
    return { questionRow: row };
}

export async function issueQuestion(context: LearningContext, target: JourneyTarget) {
    const reservation = await context.rpc<Reservation>('begin_graph_question', {
        p_node: target.nodeId,
        p_dimension: target.kind === 'dimension' ? target.dimension : null,
        p_reasoning: target.kind === 'reasoning' ? target.reasoningComplexity : null
    });
    if (reservation.active) {
        return { questionRow: reservation.active };
    }

    try {
        return await finishQuestion(context, reservation, target);
    } finally {
        await context.rpc('cancel_question_generation', { p_lease: reservation.lease });
    }
}
