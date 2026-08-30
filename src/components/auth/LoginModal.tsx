import React, { useState } from 'react';
import { Sparkles, Key, Sigma, MessageSquare, History, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginModal: React.FC = () => {
  const { signInWithGoogle, signInWithDemo } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Google sign-in failed. Please try guest mode.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col justify-between selection:bg-brand-500 selection:text-white">
      {/* Decorative background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 right-1/3 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Top Brand Nav */}
      <div className="relative max-w-6xl mx-auto w-full px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center font-extrabold text-white shadow-lg shadow-brand-500/30">
            ?Y
          </div>
          <span className="font-extrabold text-xl tracking-tight">Curious-Y</span>
        </div>
        <div className="text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Secure Google OAuth & Supabase backend</span>
        </div>
      </div>

      {/* Hero & Login Box */}
      <div className="relative max-w-5xl mx-auto w-full px-6 py-6 sm:py-12 my-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left column: Value Proposition */}
        <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AI-POWERED MICROLEARNING</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
            Learn deeper by asking{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 via-indigo-300 to-amber-300">
              &quot;Why&quot;
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-xl font-normal leading-relaxed">
            Curious-Y quizzes you on the underlying intuition behind scientific, mathematical, and historical concepts, then lets you converse with your favorite LLM.
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 text-left">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3 backdrop-blur-xs">
              <Key className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-xs text-white">Bring Your Own LLM</h2>
                <p className="text-[11px] text-slate-400">ChatGPT, Claude, or Gemini with your own API keys</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3 backdrop-blur-xs">
              <Sigma className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-xs text-white">First Principles</h2>
                <p className="text-[11px] text-slate-400">Master fundamental mechanisms, terms & relations</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3 backdrop-blur-xs">
              <MessageSquare className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-xs text-white">Follow-Up AI Tutor</h2>
                <p className="text-[11px] text-slate-400">Deep-dive chat sessions linked to each question</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3 backdrop-blur-xs">
              <History className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-xs text-white">Persisted History</h2>
                <p className="text-[11px] text-slate-400">Stored questions, answers, and chat threads</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Login Card */}
        <div className="lg:col-span-5 w-full max-w-md mx-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-600 flex items-center justify-center font-black text-2xl mx-auto shadow-lg shadow-brand-500/40">
                ?
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Welcome to Curious-Y</h2>
              <p className="text-xs text-slate-300">
                Sign in with Google to access your personalized questions and settings.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs">
                {error}
              </div>
            )}

            {/* Google Sign-in Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm flex items-center justify-center gap-3 shadow-lg shadow-black/20 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>Continue with Google</span>
            </button>

            {/* Guest / Demo Mode Button */}
            <div className="pt-2">
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
                  Or
                </span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <button
                type="button"
                onClick={signInWithDemo}
                className="w-full py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Try Explorer Demo (No Google OAuth required)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Your API keys and learning history are securely stored in your private Supabase profile.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative max-w-6xl mx-auto w-full px-6 py-6 text-center text-xs text-slate-500 border-t border-white/5">
        Curious-Y &bull; Typescript &bull; ReactJS &bull; Supabase &bull; Bring Your Own LLM
      </div>
    </div>
  );
};
