import { knowledgeGraph, nextTarget, type LearningGraph } from '../_shared/journey.ts';
import { selectCurriculumTarget } from './curriculumSelection.ts';
import { KNOWLEDGE_RESOURCES } from '../_shared/resources.ts';
import { randomItem } from './curriculumRules.ts';
import { createRpc, loadGraph, type Database, type LearningContext } from './learningContext.ts';
import { expandCurriculum } from './expandCurriculum.ts';
import { issueQuestion } from './issueQuestion.ts';
export { savedGraph } from './learningContext.ts';
export { validateJourneyQuestion } from './questionContent.ts';

function requestedTopic(body: Record<string, unknown>): string {
    if (body.topic === undefined) {
        return randomItem(KNOWLEDGE_RESOURCES).topic;
    }

    if (typeof body.topic !== 'string' || !KNOWLEDGE_RESOURCES.some(resource => resource.topic === body.topic)) {
        throw new Error('Choose a valid topic.');
    }

    return body.topic;
}

async function handlePractice(context: LearningContext, body: Record<string, unknown>) {
    const topic = body.topic === undefined ? undefined : requestedTopic(body);
    const graph = await loadGraph(context.rpc);
    if (body.generation !== undefined && body.generation !== graph.generation) {
        throw new Error('Progress was reset. Please start learning again.');
    }

    if (body.targetNodeId !== undefined) {
        return handleQuestion(context, body.targetNodeId);
    }

    return selectPractice(context, graph, topic);
}

async function selectPractice(context: LearningContext, graph: LearningGraph & { generation: number }, topic?: string) {
    const target = selectCurriculumTarget(graph, topic);
    if (target && target.expanded !== false) {
        return handleQuestion(context, target.id);
    }

    return expandCurriculum(context, graph, topic ?? target?.topic ?? requestedTopic({}), target);
}

async function handleQuestion(context: LearningContext, nodeId: unknown) {
    const graph = await loadGraph(context.rpc);
    const node = knowledgeGraph(graph).nodes.find(candidate => candidate.id === nodeId);
    if (!node || node.status === 'completed') {
        throw new Error('This discovery is unavailable.');
    }

    return issueQuestion(context, {
        nodeId: node.id,
        ...nextTarget(node)
    });
}

export async function handleJourney(db: Database, userId: string, body: Record<string, unknown>, getKey: () => Promise<string>) {
    const context = {
        rpc: createRpc(db, userId),
        getKey
    };
    if (body.action === 'knowledge_graph') {
        return { journey: knowledgeGraph(await loadGraph(context.rpc)) };
    }

    if (body.action === 'journey_practice') {
        return handlePractice(context, body);
    }

    if (body.action === 'journey_question') {
        return handleQuestion(context, body.nodeId);
    }

    throw new Error('Unknown learning action.');
}
