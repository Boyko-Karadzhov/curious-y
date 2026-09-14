import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

export function LocalLoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [creating, setCreating] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const result = creating
                ? await supabase.auth.signUp({
                    email,
                    password
                })
                : await supabase.auth.signInWithPassword({
                    email,
                    password
                });
            if (result.error) {
                throw result.error;
            }

            if (!result.data.session) {
                setError('Check local Mailpit for a confirmation email, then sign in.');
            }
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Local sign-in failed.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-slate-300 text-center">
                Use a local account to test the backend. It is separate from your hosted account.
            </p>
            <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="Email"
                aria-label="Email"
                required
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder:text-slate-400"
            />
            <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={creating ? 'new-password' : 'current-password'}
                placeholder="Password"
                aria-label="Password"
                minLength={6}
                required
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-sm text-white placeholder:text-slate-400"
            />
            {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-slate-900 disabled:opacity-50"
            >
                {loading ? 'Please wait…' : creating ? 'Create local account' : 'Sign in locally'}
            </button>
            <button
                type="button"
                onClick={() => {
                    setCreating(!creating);
                    setError(null);
                }}
                className="w-full text-xs text-slate-300 hover:text-white"
            >
                {creating ? 'Already have a local account? Sign in' : 'Need a local account? Create one'}
            </button>
        </form>
    );
}
