import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JourneyExplorer } from '../components/concepts/JourneyExplorer';
import { answerDemoQuestion, clearDemoPending, demoJourney, demoJourneyView, demoLibraryConcepts } from '../lib/kingdom/demoLearning';
import { generateDemoJourneyQuestion } from '../lib/kingdom/demoJourneyQuestions';
import { DIMENSION_ORDER, type JourneyStep } from '../../supabase/functions/_shared/journey';
import { REASONING_COMPLEXITIES } from '../../supabase/functions/_shared/reasoning';

const user = 'demo-mastery';
async function answer(target: JourneyStep, correct = true, now?: string) {
    demoJourney(user, 'Life');
    const question = await generateDemoJourneyQuestion(user, 'Life', {
        nodeId: 'food-fuel',
        ...target
    });
    const result = await answerDemoQuestion(user, question, correct ? question.correctIndex : (question.correctIndex + 1) % 4, demoLibraryConcepts(user), now);
    clearDemoPending(user, question.id);
    return result;
}

describe('Proficiency, mastery and recall in the saved journey', () => {
    beforeEach(() => localStorage.clear());
    it('locks reasoning challenges until every dimension is complete, then records each reasoning complexity', async () => {
        demoJourney(user, 'Life');
        await expect(answer({
            kind: 'reasoning',
            reasoningComplexity: 'directInference'
        })).rejects.toThrow(/revealed/);
        for (const dimension of DIMENSION_ORDER) {
            await answer({
                kind: 'dimension',
                dimension
            });
        }

        expect(demoJourneyView(user, 'Life').nodes[0].status).toBe('proficient');
        const onStart = vi.fn();
        const props = {
            userId: user,
            isDemo: true,
            topic: 'Life',
            onTopic: vi.fn(),
            onStart,
            revision: 1,
            knowledgeOnly: true
        };
        const page = render(<JourneyExplorer {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /Food as fuel, proficient/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Practice this concept' }));
        expect(onStart).toHaveBeenCalledWith('Life', expect.objectContaining({
            kind: 'reasoning',
            reasoningComplexity: 'directInference'
        }));
        await answer({
            kind: 'reasoning',
            reasoningComplexity: 'directInference'
        }, false);
        for (const complexity of REASONING_COMPLEXITIES) {
            const result = await answer({
                kind: 'reasoning',
                reasoningComplexity: complexity
            });
            expect(result.reward?.calculation?.lowValue).toBe(false);
            expect(demoJourneyView(user, 'Life').nodes[0].status).toBe(complexity === REASONING_COMPLEXITIES.at(-1) ? 'mastered' : 'proficient');
        }

        page.rerender(<JourneyExplorer {...props} revision={2} />);
        expect(await screen.findByRole('button', { name: /Food as fuel, mastered/i })).toBeInTheDocument();
        expect(demoLibraryConcepts(user).find(c => c.canonicalName === 'Food as fuel')?.mastery).toBe('mastered');
        page.unmount();
        render(<JourneyExplorer {...props} revision={3} />);
        expect(await screen.findByRole('button', { name: /Food as fuel, mastered/i })).toBeInTheDocument();
    });
    it('shows overdue evidence for review and keeps proficiency after a missed review', async () => {
        demoJourney(user, 'Life');
        const past = new Date(Date.now() - 2 * 86400000).toISOString();
        for (const dimension of DIMENSION_ORDER) {
            await answer({
                kind: 'dimension',
                dimension
            }, true, past);
        }

        expect(demoJourneyView(user, 'Life').nodes[0].rusty).toBe(true);
        render(<JourneyExplorer userId={user} isDemo knowledgeOnly topic="Life" onTopic={vi.fn()} onStart={vi.fn()} revision={0} />);
        expect(await screen.findByRole('button', { name: /Food as fuel, proficient · ready to refresh/i })).toBeInTheDocument();
        const missed = await answer({
            kind: 'dimension',
            dimension: 'intuition'
        }, false);
        expect(missed.reward?.calculation?.due).toBe(true);
        expect(demoJourneyView(user, 'Life').nodes[0].status).toBe('proficient');
    });
});
