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
});
