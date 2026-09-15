import { nodeAvailable, nodeStatus, topicNodeIds, type JourneyNode, type LearningGraph } from '../_shared/journey.ts';
import { randomItem } from './curriculumRules.ts';

/** Unexpanded concepts share the same lottery as eligible, unfinished concepts. */
export function selectCurriculumTarget(graph: LearningGraph, topic?: string, random = Math.random): JourneyNode | undefined {
    const scope = topicNodeIds(graph.nodes, topic);
    const candidates = graph.nodes.filter(node => scope.has(node.id) && selectable(node, graph));
    const bosses = candidates.filter(node => node.kind === 'boss');
    return randomItem(bosses.length ? bosses : candidates, random);
}

function selectable(node: JourneyNode, graph: LearningGraph): boolean {
    const status = nodeStatus(node, graph.progress);
    return status !== 'completed' && status !== 'mastered'
        && (node.expanded === false || nodeAvailable(node, graph.nodes, graph.progress));
}

/** Follow just one unfinished prerequisite branch, stopping as soon as practice is possible. */
export function prerequisiteTarget(node: JourneyNode, graph: LearningGraph, random = Math.random): JourneyNode {
    if (node.expanded === false || nodeAvailable(node, graph.nodes, graph.progress)) {
        return node;
    }

    const parents = node.requires.map(edge => graph.nodes.find(candidate => candidate.id === edge.nodeId)!)
        .filter(parent => nodeStatus(parent, graph.progress) !== 'mastered');
    const parent = randomItem(parents, random);
    if (!parent) {
        throw new Error('No unfinished prerequisite is available.');
    }

    return prerequisiteTarget(parent, graph, random);
}
