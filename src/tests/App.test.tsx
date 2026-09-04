import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';

describe('App Full Flow Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders LoginModal when user is not authenticated', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Welcome to Curious-Y/i)).toBeInTheDocument();
      expect(screen.getByText(/Continue with Google/i)).toBeInTheDocument();
      expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
    });
  });

  it('allows logging in with Explorer Demo and renders microlearning dashboard with topic chooser prompt', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Try Explorer Demo/i));

    await waitFor(() => {
      expect(screen.getAllByText(/Curious-Y/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Explorer Preview Mode/i)).toBeInTheDocument();
      expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Surprise Me \(Random\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Topics:/i)).toBeInTheDocument();
      expect(screen.getByText(/^Physics$/i)).toBeInTheDocument();
    });
  });

  it('generates and displays a new question when Next Question is clicked after answering', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    );

    // Log in as demo user
    await waitFor(() => {
      expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Try Explorer Demo/i));

    // Verify user is prompted to choose topic or random
    await waitFor(() => {
      expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Choose Random/i)).toBeInTheDocument();
    });

    // Click Choose Random
    fireEvent.click(screen.getByText(/Choose Random/i));

    // Wait for question to appear
    await waitFor(() => {
      expect(screen.getByText(/Select the most accurate reason below:/i)).toBeInTheDocument();
    });

    // Find the initial question text
    const subtitle = screen.getByText(/Select the most accurate reason below:/i);
    const initialQuestionHeading = subtitle.parentElement?.querySelector('div')?.textContent;
    expect(initialQuestionHeading).toBeTruthy();

    // Answer Option A
    const optionA = screen.getAllByText(/^A$/)[0].closest('button')!;
    expect(optionA).toBeInTheDocument();
    fireEvent.click(optionA);

    // Explanation and Next Question button should appear
    await waitFor(() => {
      expect(screen.getByText(/Next Question/i)).toBeInTheDocument();
    });

    // Click Next Question
    const nextBtn = screen.getByText(/Next Question/i).closest('button')!;
    fireEvent.click(nextBtn);

    // Wait for the new question to appear with a different text
    await waitFor(() => {
      const currentSubtitle = screen.getByText(/Select the most accurate reason below:/i);
      const newQuestionHeading = currentSubtitle.parentElement?.querySelector('div')?.textContent;
      expect(newQuestionHeading).toBeTruthy();
      expect(newQuestionHeading).not.toBe(initialQuestionHeading);
    });

    // Next Question button should no longer be visible because the new question is unanswered
    expect(screen.queryByText(/Next Question/i)).not.toBeInTheDocument();
  });

  it('triggers an attention check reinforcement question when answering incorrectly', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    );

    // Log in as demo user
    await waitFor(() => {
      expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Try Explorer Demo/i));

    // Prompted to choose topic - select Physics where Option A is an incorrect answer
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Choose topic Physics/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Choose topic Physics/i }));

    // Wait for initial question
    await waitFor(() => {
      expect(screen.getByText(/Select the most accurate reason below:/i)).toBeInTheDocument();
    });

    // Answer an incorrect distractor option
    let incorrectOption: HTMLElement | null = null;
    await waitFor(
      () => {
        const buttons = screen.getAllByRole('button');
        incorrectOption =
          buttons.find((btn) => btn.getAttribute('data-is-correct') === 'false') || null;
        expect(incorrectOption).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
    fireEvent.click(incorrectOption!);

    // Verify explanation with Attention Check Ahead banner appears
    await waitFor(() => {
      expect(screen.getByText(/Good Try! Here is why:/i)).toBeInTheDocument();
      expect(screen.getByText(/Attention Check Ahead:/i)).toBeInTheDocument();
      expect(screen.getByText(/Next Question/i)).toBeInTheDocument();
    });

    // Click Next Question
    const nextBtn = screen.getByText(/Next Question/i).closest('button')!;
    fireEvent.click(nextBtn);

    // The next generated question should now be a reinforcement question with the attention check badge
    await waitFor(() => {
      expect(screen.getByText(/^Attention Check$/i)).toBeInTheDocument();
      expect(screen.getByText(/Follow-Up Attention Check:/i)).toBeInTheDocument();
    });
  });

  it('generates a question in the chosen topic when a specific topic card is clicked', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    );

    // Log in as demo user
    await waitFor(() => {
      expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Try Explorer Demo/i));

    // Wait for topic prompt
    await waitFor(() => {
      expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
    });

    // Click the "Physics" topic card
    const physicsCard = screen.getByRole('button', { name: /Choose topic Physics/i });
    expect(physicsCard).toBeInTheDocument();
    fireEvent.click(physicsCard);

    // Question in Physics should appear
    await waitFor(() => {
      expect(screen.getByText(/Select the most accurate reason below:/i)).toBeInTheDocument();
      expect(screen.getAllByText(/^Physics$/i).length).toBeGreaterThan(0);
    });
  });

  it('allows returning to the topic selection screen by clicking Change Topic', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    );

    // Log in as demo user
    await waitFor(() => {
      expect(screen.getByText(/Try Explorer Demo/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Try Explorer Demo/i));

    // Choose random
    await waitFor(() => {
      expect(screen.getByText(/Choose Random/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Choose Random/i));

    // Wait for question
    await waitFor(() => {
      expect(screen.getByText(/Select the most accurate reason below:/i)).toBeInTheDocument();
    });

    // Click "Change Topic"
    const changeTopicButtons = screen.getAllByText(/Change Topic/i);
    expect(changeTopicButtons.length).toBeGreaterThan(0);
    fireEvent.click(changeTopicButtons[0]);

    // Should be back on the topic selection screen
    await waitFor(() => {
      expect(screen.getByText(/What do you want to explore\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Surprise Me \(Random\)/i)).toBeInTheDocument();
    });
  });
});
