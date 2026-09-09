import { describe, expect, it } from 'vitest';
import { allocateResources, createLearningReward, KNOWLEDGE_RESOURCES, normalizeTopicWeights } from '../../supabase/functions/_shared/resources';
import { applyAction, newKingdom } from '../lib/kingdom/game';
import { changeKingdom, loadKingdom, resetKingdom } from '../lib/kingdom/storage';
import { clearPendingReward, loadPendingReward, savePendingReward } from '../lib/kingdom/pendingReward';
import type { Question } from '../types';

const weights = { Physics: .7, 'Mathematics & Logic': .2, 'Earth & Space': .1 };
describe('authoritative resource distribution', () => {
    it('allocates the source example and conserves every tiny total in canonical order', () => {
        expect(allocateResources(28, weights, 'Physics')).toEqual([
            { key: 'force', amount: 20 }, { key: 'runes', amount: 5 }, { key: 'astral', amount: 3 },
        ]);
        expect(allocateResources(20, weights, 'Physics')).toEqual([
            { key: 'force', amount: 14 }, { key: 'runes', amount: 4 }, { key: 'astral', amount: 2 },
        ]);
        const all = Object.fromEntries([...KNOWLEDGE_RESOURCES].reverse().map(r => [r.topic, 1]));
        for (let total = 0; total <= 100; total++) {
            for (const distribution of [weights, all, { Physics: Number.MAX_VALUE, Life: Number.MAX_VALUE }]) {
                const lines = allocateResources(total, distribution, 'Physics');
                expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(total);
                expect(lines.every(line => Number.isInteger(line.amount) && line.amount > 0)).toBe(true);
            }
        }
        expect(allocateResources(3, all, 'Life')).toEqual([
            { key: 'force', amount: 1 }, { key: 'runes', amount: 1 }, { key: 'reagents', amount: 1 },
        ]);
        expect(allocateResources(1, { Life: 2, Physics: 2 }, 'Life')).toEqual([{ key: 'force', amount: 1 }]);
    });
    it('filters malformed weights and uses only the verified fallback topic', () => {
        expect(normalizeTopicWeights({ Physics: 7, Life: 3, Unknown: 999, Chemistry: -1, 'Earth & Space': '2' }, 'Life'))
            .toEqual({ Physics: .7, Life: .3 });
        for (const malformed of [null, [], 'Physics', { Physics: NaN, Life: Infinity, Chemistry: 0, Unknown: 1 }]) {
            expect(allocateResources(3, malformed, 'Mind & Behavior')).toEqual([{ key: 'insight', amount: 3 }]);
        }
        expect(normalizeTopicWeights({ Physics: Number.MAX_VALUE, Life: Number.MAX_VALUE }, 'Life')).toEqual({ Physics: .5, Life: .5 });
        for (const total of [-1, .1, NaN, Infinity]) {
            expect(() => allocateResources(total, weights, 'Physics')).toThrow();
        }
        expect(() => allocateResources(3, null, 'Invented')).toThrow();
    });
    it('freezes Demo pending amounts, preserves old obligations, and rejects collection after reset', async () => {
        localStorage.clear();
        const reward = createLearningReward('weighted', true, weights, 'Physics');
        const question: Question = { id: 'weighted', topic: 'Physics', questionText: 'Why?', options: ['a','b','c','d'], correctIndex: 0,
            explanation: 'Because', isCorrect: true, topicWeights: weights, reward };
        savePendingReward('demo', question);
        question.topicWeights = { Life: 1 };
        expect(loadPendingReward('demo')!.reward).toEqual(reward);
        await Promise.all([1,2,3].map(() => changeKingdom('demo', { type: 'answer', id: 'weighted', topic: 'Physics', correct: true, reward })));
        expect(loadKingdom('demo').tokens).toMatchObject({ Physics: 7, 'Mathematics & Logic': 2, 'Earth & Space': 1 });
        expect(applyAction(newKingdom(), { type: 'answer', id: 'weighted', topic: 'Physics', correct: true, reward }).gold).toBe(0);
        resetKingdom('demo'); clearPendingReward('demo');
        await expect(changeKingdom('demo', { type: 'answer', id: 'weighted', topic: 'Physics', correct: true, reward })).rejects.toThrow(/reset/);
        localStorage.setItem('curious_y_pending_reward_old-demo', JSON.stringify({ ...question, reward: undefined, isCorrect: false }));
        const old = loadPendingReward('old-demo')!;
        expect(old.reward!.lines).toEqual([{ key: 'force', amount: 3 }]);
        expect(JSON.parse(localStorage.getItem('curious_y_pending_reward_old-demo')!).reward).toEqual(old.reward);
    });
});
