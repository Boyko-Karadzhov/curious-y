import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuestionCard } from '../components/question/QuestionCard';
import { Question } from '../types';

const mockQuestion: Question = {
  id: 'q1',
  topic: 'Physics',
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

  it('reveals explanation and Next Question button when answered', () => {
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

    const nextBtn = screen.getByText(/Next Question/i).closest('button');
    expect(nextBtn).toBeInTheDocument();
    if (nextBtn) {
      fireEvent.click(nextBtn);
    }
    expect(handleNext).toHaveBeenCalled();
  });
});
