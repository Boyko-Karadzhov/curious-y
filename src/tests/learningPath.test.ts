import { beforeEach, describe, expect, it } from 'vitest';
import { DIMENSION_ORDER, type JourneyView, type VisibleNode } from '../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES } from '../../supabase/functions/_shared/reasoning';
import { newKingdom } from '../lib/kingdom/game';
import { nextLearningStep, restoreLearningPath, saveLearningPath, towerPath, type LearningPath } from '../lib/kingdom/learningPath';

const node = (id: string, status: VisibleNode['status'] = 'exploring', parents: string[] = []): VisibleNode => ({
    id,
    title: id,
    topic: 'Physics',
    kind: 'concept',
    status,
    rusty: false,
    requires: parents.map(nodeId => ({ nodeId })),
    progress: {},
});
const graph = (...nodes: VisibleNode[]): JourneyView => ({
    id: 'knowledge',
    title: 'Knowledge',
    nodes,
    frontiers: []
});
const conceptPath: LearningPath = {
    kind: 'concept',
    topic: 'Physics',
    nodeId: 'force'
};

describe('Learning path continuation', () => {
    beforeEach(() => localStorage.clear());
    it('keeps topic selection and random selection distinct', () => {
        expect(nextLearningStep({
            kind: 'topic',
            topic: 'Life'
        }, newKingdom())).toMatchObject({ topic: 'Life' });
        expect(nextLearningStep({ kind: 'random' }, newKingdom())).not.toHaveProperty('topic');
    });
    it('stays on the chosen concept and advances its facet after confirmation', () => {
        const force = node('force');
        force.progress.intuition = {
            attempts: 3,
            successes: 1
        };
        expect(nextLearningStep(conceptPath, newKingdom(), graph(force, node('other'))).target).toEqual({
            nodeId: 'force',
            kind: 'dimension',
            dimension: 'precision'
        });
    });
    it('continues reasoning questions until mastery, even when related concepts are available', () => {
        const force = node('force', 'proficient');
        force.progress = Object.fromEntries(DIMENSION_ORDER.map(dimension => [dimension, {
            attempts: 1,
            successes: 1
        }]));
        for (const complexity of REASONING_COMPLEXITIES.slice(0, -1)) {
            force.progress[complexity] = {
                attempts: 1,
                successes: 1
            };
        }

        expect(nextLearningStep(conceptPath, newKingdom(), graph(force, node('motion', 'discovered', ['force']))).target).toEqual({
            nodeId: 'force',
            kind: 'reasoning',
            reasoningComplexity: 'derivation'
        });
    });
    it('prefers a dependent concept over a prerequisite and unrelated nodes, across topics', () => {
        const child = {
            ...node('motion', 'discovered', ['force']),
            topic: 'Earth & Space'
        };
        const step = nextLearningStep(conceptPath, newKingdom(), graph(node('unrelated'), node('foundation'), node('force', 'mastered', ['foundation']), child));
        expect(step).toMatchObject({
            topic: 'Earth & Space',
            target: { nodeId: 'motion' },
            path: {
                kind: 'concept',
                nodeId: 'motion',
                topic: 'Physics'
            }
        });
    });
    it('traverses mastered neighbors to find a related unmastered concept', () => {
        expect(nextLearningStep(conceptPath, newKingdom(), graph(node('force', 'mastered'), node('bridge', 'mastered', ['force']), node('next', 'discovered', ['bridge']))).target?.nodeId).toBe('next');
    });
    it('falls back to topic practice when no related unmastered concept is available', () => {
        const step = nextLearningStep(conceptPath, newKingdom(), graph(node('force', 'mastered'), node('unrelated')));
        expect(step).toEqual({
            path: {
                kind: 'topic',
                topic: 'Physics'
            },
            topic: 'Physics'
        });
    });
    it('does not silently abandon concept practice when the graph could not load', () => {
        expect(() => nextLearningStep(conceptPath, newKingdom())).toThrow('check concept mastery');
    });
    it('moves through goal resource deficits, then reports that learning is done', () => {
        const path: LearningPath = {
            kind: 'goal',
            goal: {
                type: 'building',
                id: 'barracks',
                level: 1
            }
        };
        const state = newKingdom();
        expect(nextLearningStep(path, state).topic).toBe('Life');
        state.tokens.Life = 5;
        expect(nextLearningStep(path, state).topic).toBe('Earth & Space');
        state.tokens['Earth & Space'] = 5;
        expect(nextLearningStep(path, state).done).toContain('learning complete');
        state.buildings.barracks = 1;
        expect(nextLearningStep(path, state).done).toContain('goal complete');
    });
    it('stops a recruitment shortcut once its captured pack is recruited', () => {
        const state = newKingdom(); state.buildings.barracks = 1; state.recruitCount.barracks = 1;
        expect(nextLearningStep({
            kind: 'goal',
            goal: {
                type: 'recruit',
                id: 'barracks',
                count: 1
            }
        }, state).done).toContain('goal complete');
    });
    it('finishes tower shortcuts at the original milestone', () => {
        const state = newKingdom(), path = towerPath(state, 'Physics');
        state.towers.points.force = 1_000_000;
        expect(nextLearningStep(path, state).done).toContain('target reached');
    });
    it('restores the path only for the matching account and question', () => {
        saveLearningPath('alice', 'q1', conceptPath);
        expect(restoreLearningPath('alice', 'q1', 'Life')).toEqual(conceptPath);
        expect(restoreLearningPath('alice', 'q2', 'Life')).toEqual({
            kind: 'topic',
            topic: 'Life'
        });
        expect(restoreLearningPath('bob', 'q1', 'Life')).toEqual({
            kind: 'topic',
            topic: 'Life'
        });
    });
});
