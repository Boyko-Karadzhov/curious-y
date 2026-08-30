import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';

const TestAuthConsumer: React.FC = () => {
  const { user, signInWithDemo, signOut, isDemoUser } = useAuth();

  return (
    <div>
      <div data-testid="user-status">{user ? `Logged in: ${user.user_metadata?.full_name}` : 'Logged out'}</div>
      <div data-testid="is-demo">{isDemoUser ? 'demo' : 'real'}</div>
      <button onClick={signInWithDemo}>Sign In Demo</button>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts logged out when no session or stored user exists', async () => {
    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-status')).toHaveTextContent('Logged out');
    });
  });

  it('signs in with guest demo mode and logs out', async () => {
    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    const signInBtn = screen.getByText('Sign In Demo');
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(screen.getByTestId('user-status')).toHaveTextContent('Explorer Learner');
      expect(screen.getByTestId('is-demo')).toHaveTextContent('demo');
    });

    const signOutBtn = screen.getByText('Sign Out');
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(screen.getByTestId('user-status')).toHaveTextContent('Logged out');
    });
  });
});
