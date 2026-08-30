import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { FollowUpChat } from '../components/chat/FollowUpChat';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider } from '../context/AuthContext';
import { Question } from '../types';

const mockQuestion: Question = {
  id: 'q100',
  topic: 'Calculus',
  questionText: 'Why is the area under $f(x)=x$ from 0 to $a$ equal to $\\frac{1}{2}a^2$?',
  options: ['Because it is a triangle', 'Because power rule', 'By definition', 'Fermat theorem'],
  correctIndex: 0,
  explanation: 'The geometric shape formed between the line $y=x$, the x-axis, and $x=a$ is a right triangle with base $a$ and height $a$. The area is $\\frac{1}{2}\\text{base}\\times\\text{height} = \\frac{1}{2}a^2$.',
  suggestedQuestions: [
    'How does the base $a$ and height $a$ relate to the integral $\\int_0^a x\\,dx$?',
    'What would happen if the function was changed to $f(x)=2x$?',
    'Why is the factor $\\frac{1}{2}$ geometrically necessary for triangular integration?',
  ],
};

describe('FollowUpChat Component', () => {
  beforeEach(() => {
    localStorage.setItem(
      'curious_y_demo_user',
      JSON.stringify({
        id: 'test-user',
        email: 'test@example.com',
        user_metadata: { full_name: 'Test Learner' },
      })
    );
  });

  it('renders chat header and suggested questions related to terms and relations', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <FollowUpChat question={mockQuestion} />
        </SettingsProvider>
      </AuthProvider>
    );

    expect(screen.getByText(/Deep-Dive Chat/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ask anything about this Calculus question/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText(/What would happen if the function was changed to/i)).toBeInTheDocument();
    });
  });

  it('allows clicking a suggested prompt and submitting message', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <FollowUpChat question={mockQuestion} />
        </SettingsProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/What would happen if the function was changed to/i)).toBeInTheDocument();
    });

    const promptBtn = screen.getByText(/What would happen if the function was changed to/i);
    fireEvent.click(promptBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/function was changed/i).length).toBeGreaterThan(0);
    });
  });
});
