import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JourneyExplorer } from '../components/concepts/JourneyExplorer';
import { answerDemoQuestion, clearDemoPending, demoJourney, demoJourneyView, demoLibraryConcepts } from '../lib/kingdom/demoLearning';
import { generateDemoJourneyQuestion } from '../lib/kingdom/demoJourneyQuestions';
import { type Facet } from '../../supabase/functions/_shared/journey';

const user = 'demo-mastery';
async function answer(facet: Facet, correct = true, now?: string) {
    demoJourney(user, 'Life');
    const question = await generateDemoJourneyQuestion(user, 'Life', { nodeId: 'food-fuel', facet });
    const result = await answerDemoQuestion(user, question, correct ? question.correctIndex : (question.correctIndex + 1) % 4, demoLibraryConcepts(user), now);
    clearDemoPending(user, question.id);
    return result;
}
describe('Proficiency, mastery and recall in the saved journey', () => {
    beforeEach(() => localStorage.clear());
    it('locks advanced challenges until every dimension is confirmed, then persists three distinct successes and mastery', async () => {
        const journey = demoJourney(user, 'Life');
        await expect(answer('advanced')).rejects.toThrow(/revealed/);
        for (const facet of journey.nodes[0].facets) {
            await answer(facet); await answer(facet); 
        }
        expect(demoJourneyView(user, 'Life').nodes[0].status).toBe('proficient');
        const onStart = vi.fn();
        const props = { userId: user, isDemo: true, topic: 'Life', onTopic: vi.fn(), onStart, revision: 1, knowledgeOnly: true };
        const page = render(<JourneyExplorer {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /Food as fuel, proficient/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Practice this concept' }));
        expect(onStart).toHaveBeenCalledWith('Life', expect.objectContaining({ facet: 'advanced' }));
        const prompts = new Set<string>();
        const missed = await answer('advanced', false);
        for (let i = 0; i < 3; i++) {
            const result = await answer('advanced'); prompts.add(result.questionText);
            if (i === 0) {
                expect(result.questionText).not.toBe(missed.questionText);
            }
            expect(result.reward?.calculation?.lowValue).toBe(false);
            expect(demoJourneyView(user, 'Life').nodes[0].status).toBe(i === 2 ? 'mastered' : 'proficient');
        }
        expect(prompts.size).toBe(3);
        page.rerender(<JourneyExplorer {...props} revision={2} />);
        expect(await screen.findByRole('button', { name: /Food as fuel, mastered/i })).toBeInTheDocument();
        expect(demoLibraryConcepts(user).find(c => c.canonicalName === 'Food as fuel')?.mastery).toBe('mastered');
        page.unmount();
        render(<JourneyExplorer {...props} revision={3} />);
        expect(await screen.findByRole('button', { name: /Food as fuel, mastered/i })).toBeInTheDocument();
    });
    it('shows overdue evidence for review and keeps proficiency after a missed review', async () => {
        const journey = demoJourney(user, 'Life');
        const past = new Date(Date.now() - 2 * 86400000).toISOString();
        for (const facet of journey.nodes[0].facets) {
            await answer(facet, true, past); await answer(facet, true, past); 
        }
        expect(demoJourneyView(user, 'Life').nodes[0].rusty).toBe(true);
        render(<JourneyExplorer userId={user} isDemo knowledgeOnly topic="Life" onTopic={vi.fn()} onStart={vi.fn()} revision={0} />);
        expect(await screen.findByRole('button', { name: /Food as fuel, proficient · ready to refresh/i })).toBeInTheDocument();
        const missed = await answer('intuition', false);
        expect(missed.reward?.calculation?.due).toBe(true);
        expect(demoJourneyView(user, 'Life').nodes[0].status).toBe('proficient');
    });
});
