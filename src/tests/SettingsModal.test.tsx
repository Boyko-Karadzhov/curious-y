import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsModal } from '../components/settings/SettingsModal';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider } from '../context/AuthContext';
import { DEFAULT_TOPICS } from '../types';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <AuthProvider>
      <SettingsProvider>{ui}</SettingsProvider>
    </AuthProvider>
  );
};

describe('SettingsModal Component', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'curious_y_demo_user',
      JSON.stringify({
        id: 'test-user-settings',
        email: 'test@example.com',
        user_metadata: { full_name: 'Test Settings User' },
      })
    );
  });

  it('does not render when isOpen is false', () => {
    renderWithProviders(<SettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/LLM & Learning Settings/i)).not.toBeInTheDocument();
  });

  it('renders provider choices and topics input when open', async () => {
    renderWithProviders(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/LLM & Learning Settings/i)).toBeInTheDocument();
      expect(screen.getByText(/Google Gemini/i)).toBeInTheDocument();
      expect(screen.getByText(/OpenAI \(ChatGPT\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Anthropic Claude/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Learning Topics/i)).toBeInTheDocument();
    });
  });

  it('allows switching provider and updates available models', async () => {
    renderWithProviders(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/OpenAI \(ChatGPT\)/i)).toBeInTheDocument();
    });

    const openaiBtn = screen.getByText(/OpenAI \(ChatGPT\)/i).closest('button');
    if (openaiBtn) {
      fireEvent.click(openaiBtn);
    }

    const select = screen.getByLabelText(/Model/i) as HTMLSelectElement;
    expect(select.innerHTML).toContain('GPT-4o');
  });

  it('resets topics to default when Reset to Default is clicked', async () => {
    renderWithProviders(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Learning Topics/i)).toBeInTheDocument();
    });

    const topicsTextarea = screen.getByLabelText(/Learning Topics/i) as HTMLTextAreaElement;
    fireEvent.change(topicsTextarea, { target: { value: 'Astrophysics, Music' } });
    expect(topicsTextarea.value).toBe('Astrophysics, Music');

    const resetBtn = screen.getByRole('button', { name: /Reset to Default/i });
    fireEvent.click(resetBtn);
    expect(topicsTextarea.value).toBe(DEFAULT_TOPICS);
  });
});
