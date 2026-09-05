import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsModal } from '../components/settings/SettingsModal';
import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider } from '../context/SettingsContext';

const authState = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, isDemoUser: false }));
vi.mock('../context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => authState,
}));

const backendMocks = vi.hoisted(() => ({
  getServerGeminiKeyStatus: vi.fn().mockResolvedValue(false),
  saveServerGeminiKey: vi.fn().mockResolvedValue(true),
  deleteServerGeminiKey: vi.fn().mockResolvedValue(false),
  testServerGeminiKey: vi.fn().mockResolvedValue({ success: true, message: 'Gemini connection verified.' }),
}));

vi.mock('../services/backend', () => backendMocks);

const renderWithAuth = (ui: React.ReactElement) => render(
  <AuthProvider><SettingsProvider>{ui}</SettingsProvider></AuthProvider>
);

describe('SettingsModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isDemoUser = false;
    localStorage.clear();
    localStorage.setItem('curious_y_demo_user', JSON.stringify({
      id: 'test-user-settings',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test Settings User' },
    }));
  });

  it('does not render when closed', () => {
    renderWithAuth(<SettingsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/Application Settings/i)).not.toBeInTheDocument();
  });

  it('lets the user save only their Gemini key without provider or model controls', async () => {
    renderWithAuth(<SettingsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/Application Settings/i)).toBeInTheDocument();
    expect(screen.getByText('Google Gemini')).toBeInTheDocument();
    expect(screen.getByText(/provider and model are fixed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Model/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Gemini API Key/i), { target: { value: 'test-gemini-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Save key/i }));
    await waitFor(() => {
      expect(backendMocks.saveServerGeminiKey).toHaveBeenCalledWith('test-gemini-key');
      expect(screen.getByText(/Key saved/i)).toBeInTheDocument();
    });
  });

  it('marks live Gemini unavailable in demo and disables the unsupported controls', () => {
    authState.isDemoUser = true;
    renderWithAuth(<SettingsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText(/Live Gemini is unavailable in Explorer demo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gemini API Key/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Test connection/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save key/ })).toBeDisabled();
    expect(backendMocks.saveServerGeminiKey).not.toHaveBeenCalled();
  });
});
