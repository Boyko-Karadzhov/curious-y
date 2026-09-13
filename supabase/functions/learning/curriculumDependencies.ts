import type { JourneyNode } from '../_shared/journey.ts';

function reaches(from: JourneyNode, targetId: string, nodes: Map<string, JourneyNode>, visited = new Set<string>()): boolean {
    if (from.id === targetId) {
        return true;
    }

    if (visited.has(from.id)) {
        return false;
    }

    visited.add(from.id);
    return from.requires.some(edge => {
        const parent = nodes.get(edge.nodeId);
        return !!parent && reaches(parent, targetId, nodes, visited);
    });
}

/** Keep accepted edges; omit a proposed edge when its prerequisite already reaches the target. */
export function wouldCreatePrerequisiteCycle(node: JourneyNode, parent: JourneyNode, all: JourneyNode[]): boolean {
    return reaches(parent, node.id, new Map(all.map(candidate => [candidate.id, candidate])));
}
