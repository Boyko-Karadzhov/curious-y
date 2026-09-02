import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsModal } from '../components/settings/SettingsModal';
import { SettingsProvider } from '../context/SettingsContext';
import { AuthProvider } from '../context/AuthContext';

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
    expect(screen.queryByText(/LLM & AI Settings/i)).not.toBeInTheDocument();
  });

  it('renders provider choices and API key input when open', async () => {
    renderWithProviders(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/LLM & AI Settings/i)).toBeInTheDocument();
      expect(screen.getByText(/Google Gemini/i)).toBeInTheDocument();
      expect(screen.getByText(/OpenAI \(ChatGPT\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Anthropic Claude/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
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

  it('allows entering and saving an API key', async () => {
    const onClose = vi.fn();
    renderWithProviders(<SettingsModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    });

    const apiKeyInput = screen.getByLabelText(/API Key/i) as HTMLInputElement;
    fireEvent.change(apiKeyInput, { target: { value: 'test-gemini-key' } });
    expect(apiKeyInput.value).toBe('test-gemini-key');

    const saveBtn = screen.getByRole('button', { name: /Save Settings/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Saved!/i)).toBeInTheDocument();
    });
  });
});
