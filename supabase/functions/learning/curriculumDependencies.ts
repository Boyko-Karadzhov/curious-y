import type { JourneyNode } from '../_shared/journey.ts';

export class CurriculumCycleError extends Error {
    constructor(readonly path: string[]) {
        super(`Circular prerequisite chain (each concept requires the next): ${path.join(' -> ')}`);
    }
}

/** Return a dependency path, including both endpoints, without revisiting shared branches. */
function dependencyPath(from: JourneyNode, to: string, nodes: Map<string, JourneyNode>, visited = new Set<string>()): JourneyNode[] | undefined {
    if (from.id === to) {
        return [from];
    }

    if (visited.has(from.id)) {
        return undefined;
    }

    visited.add(from.id);
    for (const edge of from.requires) {
        const parent = nodes.get(edge.nodeId);
        const path = parent && dependencyPath(parent, to, nodes, visited);
        if (path) {
            return [from, ...path];
        }
    }

    return undefined;
}

export function checkPrerequisiteCycle(node: JourneyNode, parent: JourneyNode, all: JourneyNode[]): void {
    const path = dependencyPath(parent, node.id, new Map(all.map(n => [n.id, n])));
    if (path) {
        throw new CurriculumCycleError([node.title, ...path.map(n => n.title)]);
    }
}

export function dependencyContext(node: JourneyNode, all: JourneyNode[], feedback = ''): string {
    const byId = new Map(all.map(n => [n.id, n]));
    const downstream = all.filter(candidate => dependencyPath(candidate, node.id, byId));
    return `Prerequisite constraints for target ${JSON.stringify({ id: node.id, title: node.title })}:
These concepts are the target itself or already depend on it. They CANNOT be its prerequisites, including under synonyms or newly invented IDs:
${JSON.stringify(downstream.map(n => ({ id: n.id, title: n.title })))}
Prerequisites must be independently teachable foundations. Related ideas, applications, historical explanations and mutually defining descriptions are not automatically prerequisites.
If the definition is circular, explain the same concept from simpler independent foundations, with a non-circular formal definition and explicit assumptions. Preserve its identity and factual accuracy. Do not hide a necessary prerequisite, rename it, or label a technical concept basic to evade this constraint.
${feedback ? `Repair the rejected proposal: ${feedback}. Regenerate the complete concept knowledge and its prerequisite list consistently.` : ''}`;
}
