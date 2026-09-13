import { knowledgeGraph, nextFacet, selectJourneyTarget, topicNodeIds } from '../_shared/journey.ts';
import { KNOWLEDGE_RESOURCES } from '../_shared/resources.ts';
import { randomItem } from './curriculumRules.ts';
import { createRpc, loadGraph, type Database, type LearningContext } from './learningContext.ts';
import { expandCurriculum } from './expandCurriculum.ts';
import { issueQuestion } from './issueQuestion.ts';
export { savedGraph } from './learningContext.ts';
export { journeyQuestionPrompt } from './questionPrompt.ts';
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
    const topic = requestedTopic(body);
    const graph = await loadGraph(context.rpc);
    if (body.generation !== undefined && body.generation !== graph.generation) {
        throw new Error('Progress was reset. Please start learning again.');
    }

    const target = selectJourneyTarget(knowledgeGraph(graph), topic, Math.random, topicNodeIds(graph.nodes, topic));
    if (target) {
        return handleQuestion(context, target.id);
    }

    return expandCurriculum(context, graph, topic);
}

async function handleQuestion(context: LearningContext, nodeId: unknown) {
    const graph = await loadGraph(context.rpc);
    const node = knowledgeGraph(graph).nodes.find(candidate => candidate.id === nodeId);
    if (!node || node.status === 'completed') {
        throw new Error('This discovery is unavailable.');
    }

    return issueQuestion(context, node.id, nextFacet(node));
}

export async function handleJourney(db: Database, userId: string, body: Record<string, unknown>, getKey: () => Promise<string>) {
    const context = { rpc: createRpc(db, userId), getKey };
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
