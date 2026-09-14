import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalLoginForm } from '../components/auth/LocalLoginForm';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            signUp: vi.fn(),
            signInWithPassword: vi.fn(),
        },
    },
}));

const signUp = vi.mocked(supabase.auth.signUp);
const signIn = vi.mocked(supabase.auth.signInWithPassword);

function enterCredentials() {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'learner@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
}

describe('LocalLoginForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a local account with email and password', async () => {
        signUp.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
        render(<LocalLoginForm />);
        enterCredentials();
        fireEvent.click(screen.getByRole('button', { name: 'Create local account' }));

        await waitFor(() => {
            expect(signUp).toHaveBeenCalledWith({ email: 'learner@example.test', password: 'password123' });
        });
    });

    it('signs in to an existing account and reports auth errors', async () => {
        signIn.mockResolvedValueOnce({ data: { session: null }, error: new Error('Invalid login credentials') } as never);
        render(<LocalLoginForm />);
        fireEvent.click(screen.getByRole('button', { name: 'Already have a local account? Sign in' }));
        enterCredentials();
        fireEvent.click(screen.getByRole('button', { name: 'Sign in locally' }));

        await waitFor(() => {
            expect(signIn).toHaveBeenCalledWith({ email: 'learner@example.test', password: 'password123' });
            expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
        });
    });
});
