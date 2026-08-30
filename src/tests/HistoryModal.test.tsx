import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryModal } from '../components/history/HistoryModal';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';

describe('HistoryModal Component', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed localStorage with user and history
    const userId = 'demo-user-curious-y';
    localStorage.setItem(
      'curious_y_demo_user',
      JSON.stringify({
        id: userId,
        email: 'test@example.com',
        user_metadata: { full_name: 'Test Learner' },
      })
    );

    localStorage.setItem(
      `curious_y_questions_history_${userId}`,
      JSON.stringify([
        {
          id: 'hist-q1',
          topic: 'Physics',
          questionText: 'Why does light bend when entering water?',
          options: ['Option A', 'Fermat least time', 'Option C', 'Option D'],
          correctIndex: 1,
          selectedIndex: 1,
          isCorrect: true,
          explanation: 'Fermat principle of least time.',
          createdAt: new Date().toISOString(),
        },
      ])
    );
  });

  it('renders history items with stats', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <HistoryModal isOpen={true} onClose={vi.fn()} />
        </SettingsProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Learning History & Chat Logs/i)).toBeInTheDocument();
      expect(screen.getByText(/Why does light bend when entering water\?/i)).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument(); // Accuracy
    });
  });

  it('filters history by search query', async () => {
    render(
      <AuthProvider>
        <SettingsProvider>
          <HistoryModal isOpen={true} onClose={vi.fn()} />
        </SettingsProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Why does light bend when entering water\?/i)).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search past questions/i);
    fireEvent.change(searchInput, { target: { value: 'Quantum non-existent' } });

    await waitFor(() => {
      expect(screen.getByText(/No questions found/i)).toBeInTheDocument();
    });
  });
});
