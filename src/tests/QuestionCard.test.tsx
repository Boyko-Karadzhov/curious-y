import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuestionCard } from '../components/question/QuestionCard';
import { Question } from '../types';
import confetti from 'canvas-confetti';
import { createLearningValueReward } from '../../supabase/functions/_shared/learningValue';

const mockQuestion: Question = {
    id: 'q1',
    topic: 'Physics',
    subtopic: 'Classical mechanics (conservation laws, angular momentum)',
    angle: 'Focus on a deep underlying first principle or rigorous mathematical derivation.',
    angleFit: 'Explores how conservation of angular momentum strictly dictates rotational acceleration.',
    questionText: 'Why does a spinning ice skater rotate faster when pulling arms in?',
    options: [
        'Centrifugal force increases',
        'Conservation of angular momentum $L = I\\omega$',
        'Air resistance decreases',
        'Muscle torque',
    ],
    correctIndex: 1,
    explanation: 'Because moment of inertia $I$ decreases, angular velocity $\\omega$ must increase.',
};

describe('QuestionCard Component', () => {
    it('offers a real one-resource reward for a repeated failure and confirms only after collection', () => {
        const reward = { ...createLearningValueReward('q1', false, {Physics: 1}, 'Physics', {
            canonicalConcept: 'Force', metadataKnown: true, preMastery: 'mastered', atomic: false,
            successes: 3, axisSuccesses: 3, nextDueAt: null, reasoning: 'directInference', boss: false,
            lowValueAttempts: 99, answeredAt: '2026-09-07T12:00:00.000Z',
        }), collected: false };
        const onCollect = vi.fn();
        const props = { question: {...mockQuestion, isCorrect: false}, isAnswered: true, selectedOption: 0,
            onAnswer: vi.fn(), onNextQuestion: vi.fn(), isLoadingNext: false, availableTopics: ['Physics'], onCollect };
        const card = render(<QuestionCard {...props} reward={reward} />);
        expect(screen.getByText('+1 Force')).toBeInTheDocument();
        expect(screen.queryByText(/ready to collect|Collect your Resources above/)).not.toBeInTheDocument();
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'How your reward is calculated'}));
        expect(screen.getByRole('tooltip')).toHaveTextContent('Every answer earns at least 1 Resource.');
        expect(screen.getByRole('tooltip')).not.toHaveTextContent('then 0 Resources');
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
        const collect = within(screen.getByTestId('learning-reward')).getByRole('button', {name: 'Collect'});
        fireEvent.click(collect);
        expect(onCollect).toHaveBeenCalledTimes(1);
        expect(onCollect).toHaveBeenCalledWith(collect);
        card.rerender(<QuestionCard {...props} reward={reward} isCollecting />);
        expect(screen.getByRole('button', {name: 'Collecting…'})).toBeDisabled();
        expect(screen.queryByRole('button', {name: 'Next Question'})).not.toBeInTheDocument();
        card.rerender(<QuestionCard {...props} reward={{...reward, collected: true}} />);
        expect(screen.getByText('+1 Force')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Collect'})).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Next Question'})).toBeEnabled();
    });

    it('celebrates a fresh correct answer once, but never a restored answer or reward update', () => {
        vi.mocked(confetti).mockClear();
        const props = { question: mockQuestion, isAnswered: false, selectedOption: null as number | null, onAnswer: vi.fn(), onNextQuestion: vi.fn(), isLoadingNext: false, availableTopics: ['Physics'] };
        const card = render(<QuestionCard {...props} />);
        const answered = { ...props, question: { ...mockQuestion, isCorrect: true }, isAnswered: true, selectedOption: 1 };
        card.rerender(<QuestionCard {...answered} />);
        expect(confetti).toHaveBeenCalledTimes(1);
        card.rerender(<QuestionCard {...answered} reward={{ id: 'reward-1', correct: true, topicWeights: { Physics: 1 }, totalKnowledge: 25, lines: [], collected: false }} />);
        expect(confetti).toHaveBeenCalledTimes(1);
        card.unmount();
        render(<QuestionCard {...answered} />);
        expect(confetti).toHaveBeenCalledTimes(1);
    });

    it('does not celebrate incorrect answers or answers with reduced motion enabled', () => {
        vi.mocked(confetti).mockClear();
        const props = { question: mockQuestion, isAnswered: false, selectedOption: null as number | null, onAnswer: vi.fn(), onNextQuestion: vi.fn(), isLoadingNext: false, availableTopics: ['Physics'] };
        const card = render(<QuestionCard {...props} />);
        card.rerender(<QuestionCard {...props} isAnswered question={{ ...mockQuestion, isCorrect: false }} />);
        expect(confetti).not.toHaveBeenCalled();
        card.rerender(<QuestionCard {...props} question={{ ...mockQuestion, id: 'q2' }} />);
        const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        card.rerender(<QuestionCard {...props} isAnswered question={{ ...mockQuestion, id: 'q2', isCorrect: true }} />);
        expect(confetti).not.toHaveBeenCalled();
        media.mockRestore();
    });

    it('renders question text, topic, and 4 options', () => {
        render(
            <QuestionCard
                question={mockQuestion}
                isAnswered={false}
                selectedOption={null}
                onAnswer={vi.fn()}
                onNextQuestion={vi.fn()}
                isLoadingNext={false}
                availableTopics={['Physics', 'Chemistry']}
            />
        );

        expect(screen.getByText(/Why does a spinning ice skater/i)).toBeInTheDocument();
        expect(screen.getByText('Physics')).toBeInTheDocument();
        expect(screen.getByText(/Conservation of angular momentum/i)).toBeInTheDocument();
        expect(screen.getByText(/Centrifugal force increases/i)).toBeInTheDocument();
    });

    it('calls onAnswer when an option is clicked', () => {
        const handleAnswer = vi.fn();
        render(
            <QuestionCard
                question={mockQuestion}
                isAnswered={false}
                selectedOption={null}
                onAnswer={handleAnswer}
                onNextQuestion={vi.fn()}
                isLoadingNext={false}
                availableTopics={['Physics', 'Chemistry']}
            />
        );

        const optionBtn = screen.getByText(/Centrifugal force increases/i).closest('button');
        expect(optionBtn).toBeInTheDocument();
        if (optionBtn) {
            fireEvent.click(optionBtn);
        }

        expect(handleAnswer).toHaveBeenCalledWith(0);
    });

    it('reveals explanation, subtopic, angle, and angle fit when answered', () => {
        const handleNext = vi.fn();
        render(
            <QuestionCard
                question={mockQuestion}
                isAnswered={true}
                selectedOption={1}
                onAnswer={vi.fn()}
                onNextQuestion={handleNext}
                isLoadingNext={false}
                availableTopics={['Physics', 'Chemistry']}
            />
        );

        expect(screen.getByText(/Spot On!/i)).toBeInTheDocument();
        expect(screen.getByText(/Because moment of inertia/i)).toBeInTheDocument();

        // Verify subtopic, angle, and fit breakdown
        expect(screen.getByText(/Subtopic Chosen/i)).toBeInTheDocument();
        expect(screen.getByText(/Classical mechanics \(conservation laws, angular momentum\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Exploration Angle/i)).toBeInTheDocument();
        expect(screen.getByText(/Focus on a deep underlying first principle/i)).toBeInTheDocument();
        expect(screen.getByText(/How This Question Fits The Angle/i)).toBeInTheDocument();
        expect(screen.getByText(/Explores how conservation of angular momentum strictly dictates/i)).toBeInTheDocument();

        const nextBtn = screen.getByText(/Next Question/i).closest('button');
        expect(nextBtn).toBeInTheDocument();
        if (nextBtn) {
            fireEvent.click(nextBtn);
        }

        expect(handleNext).toHaveBeenCalled();
    });

    it('does not render attention check alert when question is answered incorrectly', () => {
        render(
            <QuestionCard
                question={mockQuestion}
                isAnswered={true}
                selectedOption={0}
                onAnswer={vi.fn()}
                onNextQuestion={vi.fn()}
                isLoadingNext={false}
                availableTopics={['Physics', 'Chemistry']}
            />
        );

        expect(screen.getByText(/Good Try! Here is why:/i)).toBeInTheDocument();
        expect(screen.queryByText(/Attention Check Ahead:/i)).not.toBeInTheDocument();
        expect(screen.getByText(/Next Question/i)).toBeInTheDocument();
    });

    it('does NOT render Prerequisites met badge on a Boss question if prerequisitesMet is false or unset', () => {
        const unverifiedBossQuestion: Question = {
            ...mockQuestion,
            isBossQuestion: true,
            requiredConcepts: ['Special relativity', 'Cosmological recession velocity'],
            prerequisitesMet: false,
        };

        render(
            <QuestionCard
                question={unverifiedBossQuestion}
                isAnswered={false}
                selectedOption={null}
                onAnswer={vi.fn()}
                onNextQuestion={vi.fn()}
                isLoadingNext={false}
                availableTopics={['Earth & Space']}
            />
        );

        expect(screen.getAllByText(/Boss Question/i).length).toBeGreaterThan(0);
        expect(screen.queryByText(/Prerequisites met/i)).not.toBeInTheDocument();
    });

    it('renders Prerequisites met badge on a Boss question ONLY when prerequisitesMet is explicitly true', () => {
        const verifiedBossQuestion: Question = {
            ...mockQuestion,
            isBossQuestion: true,
            requiredConcepts: ['Velocity', 'Spatial distance'],
            prerequisitesMet: true,
        };

        render(
            <QuestionCard
                question={verifiedBossQuestion}
                isAnswered={false}
                selectedOption={null}
                onAnswer={vi.fn()}
                onNextQuestion={vi.fn()}
                isLoadingNext={false}
                availableTopics={['Physics']}
            />
        );

        expect(screen.getAllByText(/Boss Question/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Prerequisites met/i)).toBeInTheDocument();
    });

    it('renders Prerequisites met badge on verified concept questions with requiredConcepts', () => {
        const conceptQuestion: Question = {
            ...mockQuestion,
            concept: 'Phase velocity',
            requiredConcepts: ['Wavelength', 'Wave frequency'],
            prerequisitesMet: true,
        };

        render(
            <QuestionCard
                question={conceptQuestion}
                isAnswered={false}
                selectedOption={null}
                onAnswer={vi.fn()}
                onNextQuestion={vi.fn()}
                isLoadingNext={false}
                availableTopics={['Physics']}
            />
        );

        expect(screen.getByText(/Phase velocity/i)).toBeInTheDocument();
        expect(screen.getByText(/Prerequisites met/i)).toBeInTheDocument();
    });

    it('renders quick topic switcher when answered with multiple topics, including Any Topic option', () => {
        const handleNext = vi.fn();
        render(
            <QuestionCard
                question={mockQuestion}
                isAnswered={true}
                selectedOption={1}
                onAnswer={vi.fn()}
                onNextQuestion={handleNext}
                isLoadingNext={false}
                availableTopics={['Physics', 'Chemistry', 'Life']}
            />
        );

        expect(screen.getByText(/Practice specific topic next:/i)).toBeInTheDocument();

        const anyTopicBtn = screen.getByRole('button', { name: /Any Topic/i });
        expect(anyTopicBtn).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Chemistry' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Life' })).toBeInTheDocument();

        fireEvent.click(anyTopicBtn);
        expect(handleNext).toHaveBeenCalledWith(undefined);

        const chemBtn = screen.getByRole('button', { name: 'Chemistry' });
        fireEvent.click(chemBtn);
        expect(handleNext).toHaveBeenCalledWith('Chemistry');
    });
});
