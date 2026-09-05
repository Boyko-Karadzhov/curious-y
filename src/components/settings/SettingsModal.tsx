import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Cpu, ExternalLink, Eye, EyeOff, Key, Loader2, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { resetUserProgress, shouldConfirmReset } from '../../services/database';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetProgress?: () => Promise<void> | void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onResetProgress }) => {
  const { user, isDemoUser } = useAuth();
  const { settings, saving, error, updateSettings, clearApiKey, testConnection } = useSettings();
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey('');
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [isOpen, settings.hasApiKey]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testConnection(apiKey.trim() || undefined));
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Gemini connection failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setTestResult(null);
    try {
      await updateSettings({ apiKey });
      setApiKey('');
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Could not save the Gemini key.',
      });
    }
  };

  const handleClear = async () => {
    setTestResult(null);
    try {
      await clearApiKey();
      setApiKey('');
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Could not remove the Gemini key.',
      });
    }
  };

  const handleResetProgress = async () => {
    if (!user || !shouldConfirmReset()) return;
    setResetting(true);
    try {
      if (onResetProgress) await onResetProgress();
      else await resetUserProgress(user.id);
      setResetSuccess(true);
      window.setTimeout(() => setResetSuccess(false), 2000);
    } finally {
      setResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-200 bg-brand-50 text-brand-600">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Application Settings</h2>
              <p className="text-xs text-slate-500">Use your own Gemini API key</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <h3 className="text-sm font-bold text-emerald-950">Server-authoritative learning</h3>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                Signed-in questions, answer checks, mastery, and Castle progress are saved in the protected backend. Your selected goal also follows your account across devices. Only Explorer Demo progress saves in this browser.
              </p>
            </div>
          </div>

          <p className="text-xs text-amber-900" role="status">{isDemoUser ? 'Live Gemini is unavailable in Explorer demo. Sign in with Google to save a key, generate live questions, and use the AI tutor.' : ''}</p>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <fieldset disabled={isDemoUser} className="space-y-3 rounded-2xl border border-slate-200 p-4 disabled:opacity-60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Google Gemini</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${settings.hasApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isDemoUser ? 'Sign-in required' : error ? 'Status unavailable' : settings.hasApiKey ? 'Key saved' : 'Key required'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">The provider and model are fixed by the app.</p>
                </div>
              </div>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
                Get a key <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <label htmlFor="gemini-api-key" className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Key className="h-3.5 w-3.5" /> Gemini API key
            </label>
            <div className="relative">
              <input
                id="gemini-api-key"
                aria-label="Gemini API Key"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setTestResult(null);
                  setSaveSuccess(false);
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder={settings.hasApiKey ? 'Enter a new key to replace the saved key' : 'Paste your Gemini API key'}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-11 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
              <button type="button" onClick={() => setShowApiKey((shown) => !shown)} aria-label={showApiKey ? 'Hide API key' : 'Show API key'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Encrypted in Supabase Vault for your account. The saved value is never returned to the browser, and the Edge Function reads it only when Gemini is needed.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleTestConnection} disabled={(!apiKey.trim() && !settings.hasApiKey) || isTesting} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />}
                {isTesting ? 'Testing…' : 'Test connection'}
              </button>
              {testResult && (
                <span className={`flex items-center gap-1 text-xs font-medium ${testResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {testResult.message}
                </span>
              )}
              {settings.hasApiKey && (
                <button type="button" onClick={handleClear} disabled={saving} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-40">
                  <Trash2 className="h-3.5 w-3.5" /> Remove saved key
                </button>
              )}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Learning progress</h3>
              <p className="mt-0.5 text-xs text-slate-500">Permanently reset your history, mastery, and all Castle progress on this device.</p>
            </div>
            <button type="button" onClick={handleResetProgress} disabled={resetting} aria-label="Reset Progress" className="flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : resetSuccess ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <RotateCcw className="h-3.5 w-3.5" />}
              <span>{resetSuccess ? 'Reset!' : 'Reset Progress'}</span>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Close</button>
          <button type="button" onClick={handleSave} disabled={isDemoUser || saving || !apiKey.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveSuccess ? 'Saved!' : 'Save key'}
          </button>
        </div>
      </div>
    </div>
  );
};
