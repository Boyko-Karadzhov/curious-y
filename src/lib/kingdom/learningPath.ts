import { nextTarget, type JourneyTarget, type JourneyView } from '../../../supabase/functions/_shared/journey';
import { KNOWLEDGE_RESOURCES } from '../../../supabase/functions/_shared/resources';
import { TOWERS, TOWER_SCALE, TOWER_THRESHOLDS, towerLevel } from '../../../supabase/functions/_shared/towers';
import { type Kingdom, type TopicName } from './game';
import { goalProgress, goalTitle, parseGoal, type ProgressionGoal } from './goals';

export type LearningShortcut =
  | {
      kind: 'goal';
      goal: ProgressionGoal
  }
  | {
      kind: 'tower';
      topic: TopicName;
      points: number
  };
export type LearningPath = LearningShortcut
  | {
      kind: 'topic';
      topic: string
  }
  | { kind: 'random' }
  | {
      kind: 'concept';
      topic: string;
      nodeId: string
  };
export type LearningStep = {
    topic?: string;
    target?: JourneyTarget;
    path: LearningPath;
    done?: string
};

// Navigation hints only; balances and mastery are always read again before continuing.
export function saveLearningPath(userId: string, questionId: string, path: LearningPath) {
    try {
        localStorage.setItem(`curious_y_learning_path_${userId}`, JSON.stringify({
            questionId,
            path
        }));
    } catch { /* In-memory navigation still works. */ }
}

function validShortcut(path: LearningPath): LearningPath | null {
    if (path.kind === 'goal') {
        const goal = parseGoal(path.goal);
        return goal ? {
            kind: 'goal',
            goal
        } : null;
    }

    if (path.kind === 'tower' && TOWERS.some(tower => tower.topic === path.topic) && Number.isSafeInteger(path.points) && path.points > 0) {
        return path;
    }

    return null;
}

function validSavedPath(path: LearningPath): LearningPath | null {
    if (path.kind === 'random') {
        return { kind: 'random' };
    }

    if (path.kind === 'topic' && typeof path.topic === 'string') {
        return path;
    }

    if (path.kind === 'concept' && typeof path.topic === 'string' && typeof path.nodeId === 'string') {
        return path;
    }

    return validShortcut(path);
}

export function restoreLearningPath(userId: string, questionId: string, topic: string): LearningPath {
    const fallback: LearningPath = {
        kind: 'topic',
        topic
    };
    try {
        const saved = JSON.parse(localStorage.getItem(`curious_y_learning_path_${userId}`) ?? 'null');
        if (saved?.questionId !== questionId || !saved.path) {
            return fallback;
        }

        return validSavedPath(saved.path) ?? fallback;
    } catch { /* A missing navigation hint cannot block reward recovery. */ }

    return fallback;
}

export function towerPath(state: Kingdom, topic: TopicName): LearningShortcut {
    const tower = TOWERS.find(t => t.topic === topic)!;
    const points = state.towers.points[tower.key];
    return {
        kind: 'tower',
        topic,
        points: (TOWER_THRESHOLDS[towerLevel(points)] ?? TOWER_THRESHOLDS.at(-1)!) * TOWER_SCALE
    };
}

function goalStep(path: Extract<LearningPath, { kind: 'goal' }>, state: Kingdom): LearningStep {
    const progress = goalProgress(state, path.goal);
    const title = goalTitle(path.goal);
    if (progress.complete) {
        return {
            path,
            done: `${title}: goal complete!`
        };
    }

    if (progress.invalid) {
        return {
            path,
            done: 'This goal is no longer available. Choose a new goal in Castle.'
        };
    }

    const topic = KNOWLEDGE_RESOURCES.find(resource => (progress.missing[resource.name] ?? 0) > 0)?.topic;
    if (topic) {
        return {
            path,
            topic
        };
    }

    return {
        path,
        done: `${title}: learning complete! ${progress.missing.Gold ? 'Earn the remaining Gold in Battle.' : progress.blocker ?? 'You have the Resources you need. Continue in Castle.'}`
    };
}

function resourceStep(path: Extract<LearningPath, { kind: 'tower' }>, state: Kingdom): LearningStep {
    const tower = TOWERS.find(item => item.topic === path.topic)!;
    return state.towers.points[tower.key] >= path.points
        ? {
            path,
            done: `${tower.name}: learning target reached! Your next bonus is ready.`
        }
        : {
            path,
            topic: path.topic
        };
}

function conceptNeighbors(graph: JourneyView): Map<string, Set<string>> {
    const neighbors = new Map(graph.nodes.map(node => [node.id, new Set<string>()]));
    for (const node of graph.nodes) {
        for (const requirement of node.requires) {
            neighbors.get(requirement.nodeId)?.add(node.id);
            neighbors.get(node.id)?.add(requirement.nodeId);
        }
    }

    return neighbors;
}

function reachableConcept(graph: JourneyView, start: string, neighbors: Map<string, Set<string>>, queue: string[]) {
    const seen = new Set([start]);
    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) {
            continue;
        }

        seen.add(id);
        const node = graph.nodes.find(item => item.id === id);
        if (node?.kind === 'concept' && node.status !== 'mastered') {
            return node;
        }

        queue.push(...neighbors.get(id) ?? []);
    }

    return null;
}

function nextConcept(path: Extract<LearningPath, { kind: 'concept' }>, graph: JourneyView): LearningStep {
    const neighbors = conceptNeighbors(graph);
    const dependents = graph.nodes.filter(node => node.requires.some(requirement => requirement.nodeId === path.nodeId)).map(node => node.id);
    const queue = [...dependents, ...neighbors.get(path.nodeId) ?? []];
    const node = reachableConcept(graph, path.nodeId, neighbors, queue);
    if (node) {
        return {
            path: {
                ...path,
                nodeId: node.id
            },
            topic: node.topic,
            target: {
                nodeId: node.id,
                ...nextTarget(node)
            }
        };
    }

    return {
        path: {
            kind: 'topic',
            topic: path.topic
        },
        topic: path.topic
    };
}

function conceptStep(path: Extract<LearningPath, { kind: 'concept' }>, graph?: JourneyView): LearningStep {
    if (!graph) {
        throw new Error('Could not check concept mastery. Please retry.');
    }

    const current = graph.nodes.find(node => node.id === path.nodeId);
    if (current && current.status !== 'mastered' && current.status !== 'completed') {
        return {
            path,
            topic: current.topic,
            target: {
                nodeId: current.id,
                ...nextTarget(current)
            }
        };
    }

    return nextConcept(path, graph);
}

/** Re-evaluate the original destination after collecting, without changing the saved goal. */
export function nextLearningStep(path: LearningPath, state: Kingdom, graph?: JourneyView): LearningStep {
    if (path.kind === 'random') {
        return { path };
    }

    if (path.kind === 'topic') {
        return {
            path,
            topic: path.topic
        };
    }

    if (path.kind === 'goal') {
        return goalStep(path, state);
    }

    if (path.kind === 'concept') {
        return conceptStep(path, graph);
    }

    return resourceStep(path, state);
}
