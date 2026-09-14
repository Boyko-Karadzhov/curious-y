import type { JourneyView } from '../../../supabase/functions/_shared/journey';

export type GraphNode = { id: string; parents: string[] };
export type Point = { x: number; y: number };
type Layout = { ids: string[]; columns: Map<number, string[]>; depths: Map<string, number>; rows: number; width: number; height: number };

function graphNodes(journey: JourneyView): GraphNode[] {
    return [...journey.nodes.map(node => ({
        id: node.id,
        parents: node.requires.map(edge => edge.nodeId)
    })),
    ...journey.frontiers.map(frontier => ({
        id: frontier.id,
        parents: frontier.from
    }))];
}

function nodeDepth(id: string, nodes: GraphNode[], depths: Map<string, number>): number {
    if (depths.has(id)) {
        return depths.get(id)!;
    }

    depths.set(id, 0);
    const parents = (nodes.find(node => node.id === id)?.parents ?? []).filter(parent => nodes.some(node => node.id === parent));
    const depth = parents.length ? Math.max(...parents.map(parent => nodeDepth(parent, nodes, depths))) + 1 : 0;
    depths.set(id, depth);
    return depth;
}

function nodeDepths(nodes: GraphNode[]): Map<string, number> {
    const depths = new Map<string, number>();
    nodes.forEach(node => nodeDepth(node.id, nodes, depths));
    return depths;
}

function nodeNeighbors(nodes: GraphNode[]): Map<string, Set<string>> {
    const neighbors = new Map(nodes.map(node => [node.id, new Set(node.parents)]));
    for (const node of nodes) {
        for (const parent of node.parents) {
            neighbors.get(parent)?.add(node.id);
        }
    }

    return neighbors;
}

function connectedComponent(start: string, remaining: Set<string>, neighbors: Map<string, Set<string>>): string[] {
    const stack = [start];
    const component: string[] = [];
    while (stack.length) {
        const id = stack.pop()!;
        if (!remaining.delete(id)) {
            continue;
        }

        component.push(id);
        stack.push(...neighbors.get(id) ?? []);
    }

    return component;
}

function connectedComponents(nodes: GraphNode[]): string[][] {
    const remaining = new Set(nodes.map(node => node.id));
    const neighbors = nodeNeighbors(nodes);
    const components: string[][] = [];
    while (remaining.size) {
        components.push(connectedComponent(remaining.values().next().value!, remaining, neighbors));
    }

    return components;
}

function componentLayout(ids: string[], depths: Map<string, number>): Layout {
    const columns = new Map<number, string[]>();
    for (const id of ids) {
        const depth = depths.get(id)!;
        columns.set(depth, [...columns.get(depth) ?? [], id]);
    }

    const rows = Math.max(...[...columns.values()].map(column => column.length), 1);
    return {
        ids,
        columns,
        depths,
        rows,
        width: (Math.max(...columns.keys()) + 1) * 270,
        height: rows * 170 + 50
    };
}

function placeComponent(layout: Layout, offset: Point, positions: Map<string, Point>): void {
    for (const id of layout.ids) {
        const depth = layout.depths.get(id)!;
        const column = layout.columns.get(depth)!;
        positions.set(id, {
            x: offset.x + depth * 270,
            y: offset.y + (layout.rows - column.length) * 85 + column.indexOf(id) * 170
        });
    }
}

function placeLayouts(layouts: Layout[]) {
    const positions = new Map<string, Point>();
    const perRow = Math.ceil(Math.sqrt(layouts.length));
    let offsetX = 40, offsetY = 55, rowHeight = 0, width = 0;
    layouts.forEach((layout, index) => {
        if (index > 0 && index % perRow === 0) {
            offsetX = 40;
            offsetY += rowHeight + 40;
            rowHeight = 0;
        }

        placeComponent(layout, {
            x: offsetX,
            y: offsetY
        }, positions);
        offsetX += layout.width + 50;
        width = Math.max(width, offsetX);
        rowHeight = Math.max(rowHeight, layout.height);
    });
    return {
        positions,
        width,
        height: offsetY + rowHeight
    };
}

export function journeyGraphLayout(journey: JourneyView) {
    const nodes = graphNodes(journey);
    const depths = nodeDepths(nodes);
    const layouts = connectedComponents(nodes).map(ids => componentLayout(ids, depths));
    return {
        nodes,
        ...placeLayouts(layouts)
    };
}
