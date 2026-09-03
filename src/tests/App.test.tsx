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

  it('allows logging in with Explorer Demo and renders microlearning dashboard', async () => {
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
      expect(screen.getByText(/Topics:/i)).toBeInTheDocument();
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

    // Wait for initial question to appear
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

    // Wait for initial question
    await waitFor(() => {
      expect(screen.getByText(/Select the most accurate reason below:/i)).toBeInTheDocument();
    });

    // Answer Option A
    let optionA: HTMLElement | null = null;
    await waitFor(
      () => {
        optionA =
          screen
            .getAllByText(/^A$/)
            .map((el) => el.closest('button'))
            .find((btn) => btn !== null) || null;
        expect(optionA).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
    fireEvent.click(optionA!);

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
});
