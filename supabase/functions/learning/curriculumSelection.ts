import { nodeStatus, prerequisitesMastered, topicNodeIds, type JourneyNode, type LearningGraph } from '../_shared/journey.ts';
import { randomItem } from './curriculumRules.ts';

/** A concept enters the lottery only after its complete dependency tree is mastered. */
export function selectCurriculumTarget(graph: LearningGraph, topic?: string, random = Math.random): JourneyNode | undefined {
    const scope = topicNodeIds(graph.nodes, topic);
    const candidates = graph.nodes.filter(node => scope.has(node.id) && selectable(node, graph));
    const bosses = candidates.filter(node => node.kind === 'boss');
    return randomItem(bosses.length ? bosses : candidates, random);
}

function selectable(node: JourneyNode, graph: LearningGraph): boolean {
    const status = nodeStatus(node, graph.progress);
    return status !== 'completed' && status !== 'mastered'
        && prerequisitesMastered(node, graph.nodes, graph.progress);
}
