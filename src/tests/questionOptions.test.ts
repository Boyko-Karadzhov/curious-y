import { afterEach, describe, expect, it, vi } from 'vitest';
import { shuffleQuestionOptions } from '../../supabase/functions/_shared/questionOptions';

afterEach(() => vi.restoreAllMocks());

describe('Shared answer shuffle', () => {
    it.each([0, 1, 2, 3])('covers all 24 equally likely orders without bias for correct index %i', (correctIndex) => {
        const original = { options: ['First', 'Second', 'Third', 'Fourth'], correctIndex, explanation: 'Preserved' };
        const snapshot = structuredClone(original);
        const random = vi.spyOn(Math, 'random');
        const permutations = new Set<string>();
        const counts = [0, 0, 0, 0];

        // Enumerate every equally probable Fisher-Yates branch: 4 × 3 × 2.
        for (let fourth = 0; fourth < 4; fourth++) {
            for (let third = 0; third < 3; third++) {
                for (let second = 0; second < 2; second++) {
                    random.mockReset().mockReturnValueOnce((fourth + 0.5) / 4)
                        .mockReturnValueOnce((third + 0.5) / 3).mockReturnValueOnce((second + 0.5) / 2);
                    const shuffled = shuffleQuestionOptions(original);
                    permutations.add(JSON.stringify(shuffled.options));
                    counts[shuffled.correctIndex]++;
                    expect(shuffled.options[shuffled.correctIndex]).toBe(original.options[correctIndex]);
                    expect([...shuffled.options].sort()).toEqual([...original.options].sort());
                    expect(shuffled.explanation).toBe(original.explanation);
                    expect(original).toEqual(snapshot);
                }
            }
        }

        expect(permutations.size).toBe(24);
        expect(counts).toEqual([6, 6, 6, 6]);
    });
});
