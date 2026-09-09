import { nextFacet, type JourneyTarget, type JourneyView } from '../../../supabase/functions/_shared/journey';
import { TOWERS, TOWER_SCALE, TOWER_THRESHOLDS, towerLevel } from '../../../supabase/functions/_shared/towers';
import { LIBRARY_MILESTONES, forgeCost, type Kingdom, type TopicName } from './game';
import { goalProgress, goalTitle, parseGoal, type ProgressionGoal } from './goals';

export type LearningShortcut =
  | { kind: 'goal'; goal: ProgressionGoal }
  | { kind: 'tower'; topic: TopicName; points: number }
  | { kind: 'library'; concepts: number }
  | { kind: 'forge'; count: number };
export type LearningPath = LearningShortcut
  | { kind: 'topic'; topic: string }
  | { kind: 'random' }
  | { kind: 'concept'; topic: string; nodeId: string };
export type LearningStep = { topic?: string; target?: JourneyTarget; path: LearningPath; done?: string };

// Navigation hints only; balances and mastery are always read again before continuing.
export function saveLearningPath(userId: string, questionId: string, path: LearningPath) {
    try {
        localStorage.setItem(`curious_y_learning_path_${userId}`, JSON.stringify({ questionId, path })); 
    } catch { /* In-memory navigation still works. */ }
}
export function restoreLearningPath(userId: string, questionId: string, topic: string): LearningPath {
    const fallback: LearningPath = { kind: 'topic', topic };
    try {
        const saved = JSON.parse(localStorage.getItem(`curious_y_learning_path_${userId}`) ?? 'null');
        if (saved?.questionId !== questionId || !saved.path) {
            return fallback;
        }
        const path = saved.path;
        if (path.kind === 'random') {
            return { kind: 'random' };
        }
        if (path.kind === 'topic' && typeof path.topic === 'string') {
            return path;
        }
        if (path.kind === 'concept' && typeof path.topic === 'string' && typeof path.nodeId === 'string') {
            return path;
        }
        if (path.kind === 'goal') {
            const goal = parseGoal(path.goal); if (goal) {
                return { kind: 'goal', goal };
            } 
        }
        if (path.kind === 'tower' && TOWERS.some(t => t.topic === path.topic) && Number.isSafeInteger(path.points) && path.points > 0) {
            return path;
        }
        if (path.kind === 'library' && LIBRARY_MILESTONES.includes(path.concepts)) {
            return path;
        }
        if (path.kind === 'forge' && Number.isSafeInteger(path.count) && path.count > 0) {
            return path;
        }
    } catch { /* A missing navigation hint cannot block reward recovery. */ }
    return fallback;
}

export function towerPath(state: Kingdom, topic: TopicName): LearningShortcut {
    const tower = TOWERS.find(t => t.topic === topic)!;
    const points = state.towers.points[tower.key];
    return { kind: 'tower', topic, points: (TOWER_THRESHOLDS[towerLevel(points)] ?? TOWER_THRESHOLDS.at(-1)!) * TOWER_SCALE };
}
export const libraryPath = (state: Kingdom): LearningShortcut => ({ kind: 'library', concepts: LIBRARY_MILESTONES.find(n => n > state.libraryConcepts) ?? LIBRARY_MILESTONES.at(-1)! });

/** Re-evaluate the original destination after collecting, without changing the saved goal. */
export function nextLearningStep(path: LearningPath, state: Kingdom, graph?: JourneyView): LearningStep {
    const done = (message: string): LearningStep => ({ path, done: message });
    if (path.kind === 'random') {
        return { path };
    }
    if (path.kind === 'topic') {
        return { path, topic: path.topic };
    }
    if (path.kind === 'goal') {
        const progress = goalProgress(state, path.goal);
        const title = goalTitle(path.goal);
        if (progress.complete) {
            return done(`${title}: goal complete!`);
        }
        if (progress.invalid) {
            return done('This goal is no longer available. Choose a new goal in Castle.');
        }
        const topic = Object.entries(progress.missing.resources).find(([, amount]) => amount > 0)?.[0];
        if (topic) {
            return { path, topic };
        }
        return done(`${title}: learning complete! ${progress.missing.gold ? 'Earn the remaining Gold in Battle.' : progress.blocker ?? 'You have the Resources you need. Continue in Castle.'}`);
    }
    if (path.kind === 'tower') {
        const tower = TOWERS.find(t => t.topic === path.topic)!;
        return state.towers.points[tower.key] >= path.points
            ? done(`${tower.name}: learning target reached! Your next bonus is ready.`) : { path, topic: path.topic };
    }
    if (path.kind === 'library') {
        return state.libraryConcepts >= path.concepts
            ? done('Library learning milestone reached! Continue in Castle.') : { path };
    }
    if (path.kind === 'forge') {
        if (state.forge.count >= path.count) {
            return done('Forge goal complete!');
        }
        const topic = Object.entries(forgeCost().resources).find(([topic, amount]) => state.tokens[topic as TopicName] < amount)?.[0];
        return topic ? { path, topic } : done('Forge learning complete! You have the Resources you need. Continue in Castle.');
    }
    if (!graph) {
        throw new Error('Could not check concept mastery. Please retry.');
    }
    const current = graph.nodes.find(n => n.id === path.nodeId);
    if (current && current.status !== 'mastered' && current.status !== 'completed') {
        return { path, topic: current.topic, target: { nodeId: current.id, facet: nextFacet(current) } };
    }
    // Prefer the next dependent concept, then prerequisites and neighboring branches.
    // Only revealed, available concepts can be selected; hidden frontiers stay private.
    const neighbors = new Map(graph.nodes.map(n => [n.id, new Set<string>()]));
    for (const node of graph.nodes) {
        for (const requirement of node.requires) {
            neighbors.get(requirement.nodeId)?.add(node.id);
            neighbors.get(node.id)?.add(requirement.nodeId);
        }
    }
    const dependents = graph.nodes.filter(n => n.requires.some(r => r.nodeId === path.nodeId)).map(n => n.id);
    const seen = new Set([path.nodeId]), queue = [...dependents, ...neighbors.get(path.nodeId) ?? []];
    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        const node = graph.nodes.find(n => n.id === id);
        if (node?.kind === 'concept' && node.status !== 'mastered') {
            return { path: { ...path, nodeId: id }, topic: node.topic, target: { nodeId: id, facet: nextFacet(node) } };
        }
        queue.push(...neighbors.get(id) ?? []);
    }
    return { path: { kind: 'topic', topic: path.topic }, topic: path.topic };
}
