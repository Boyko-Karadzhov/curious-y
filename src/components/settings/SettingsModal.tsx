import React, { useState, useEffect } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Key,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Cpu,
  HelpCircle,
  ExternalLink,
  Loader2,
  Save,
} from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { LLMProvider, PROVIDER_MODELS, DEFAULT_TOPICS } from '../../types';
import { getSavedApiKey, saveApiKeyForProvider } from '../../services/database';
import { TopicBadge } from '../question/TopicBadge';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { settings, updateSettings, testConnection, saving } = useSettings();

  const [provider, setProvider] = useState<LLMProvider>(settings.provider);
  const [model, setModel] = useState<string>(settings.model);
  const [apiKey, setApiKey] = useState<string>(settings.apiKey);
  const [topics, setTopics] = useState<string>(settings.topics);
  const [showApiKey, setShowApiKey] = useState(false);

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Track modal open transitions so typing is never interrupted
  const wasOpenRef = React.useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const userId = user?.id || 'demo';
      const initialProvider = settings.provider || 'gemini';
      const providerKey = settings.apiKey || getSavedApiKey(userId, initialProvider);

      setProvider(initialProvider);
      setModel(settings.model || 'gemini-3.7-flash');
      setApiKey(providerKey);
      setTopics(settings.topics || DEFAULT_TOPICS);
      setTestResult(null);
      setSaveSuccess(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, user, settings]);

  // When provider changes, select recommended model and load provider-specific key
  const handleProviderChange = (newProvider: LLMProvider) => {
    const userId = user?.id || 'demo';
    if (apiKey.trim()) {
      saveApiKeyForProvider(userId, provider, apiKey);
    }

    setProvider(newProvider);
    const available = PROVIDER_MODELS[newProvider] || [];
    const recommended = available.find((m) => m.recommended) || available[0];
    setModel(recommended ? recommended.id : '');

    const savedKey = getSavedApiKey(userId, newProvider);
    setApiKey(savedKey || (newProvider === settings.provider ? settings.apiKey : ''));
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(provider, model, apiKey);
      setTestResult(result);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to provider.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const userId = user?.id || 'demo';
    if (apiKey.trim()) {
      saveApiKeyForProvider(userId, provider, apiKey);
    }

    try {
      await updateSettings({
        provider,
        model,
        apiKey,
        topics: topics.trim() || DEFAULT_TOPICS,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleResetTopics = () => {
    setTopics(DEFAULT_TOPICS);
  };

  if (!isOpen) return null;

  const currentModels = PROVIDER_MODELS[provider] || [];
  const parsedTopicsPreview = topics
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const getKeyHelpLink = () => {
    switch (provider) {
      case 'gemini':
        return 'https://aistudio.google.com/app/apikey';
      case 'openai':
        return 'https://platform.openai.com/api-keys';
      case 'anthropic':
        return 'https://console.anthropic.com/settings/keys';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 shadow-2xs">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">LLM & Learning Settings</h2>
              <p className="text-xs text-slate-500">
                Bring Your Own LLM & customize learning topics (persisted to your profile)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Provider Selection */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-600" />
              <span>Select AI Provider</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'gemini', label: 'Google Gemini', desc: 'Fast & Rich Reasoning' },
                { id: 'openai', label: 'OpenAI (ChatGPT)', desc: 'GPT-4o & o3-mini' },
                { id: 'anthropic', label: 'Anthropic Claude', desc: 'Claude 3.7 / 3.5' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id as LLMProvider)}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                    provider === p.id
                      ? 'border-brand-500 bg-brand-50/50 shadow-xs ring-2 ring-brand-400/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="font-bold text-xs sm:text-sm text-slate-900">{p.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Model Dropdown / Custom Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="model-select" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-600" />
                <span>Model</span>
              </label>
              <span className="text-xs font-normal text-slate-500">
                {currentModels.length} models available
              </span>
            </div>

            <div className="relative">
              <select
                id="model-select"
                value={currentModels.some((m) => m.id === model) ? model : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setModel(e.target.value);
                  }
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all cursor-pointer"
              >
                {currentModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.recommended ? '⭐ (Recommended)' : ''} ({m.id}) — {m.description}
                  </option>
                ))}
                <option value="custom">✏️ Enter custom model ID...</option>
              </select>
            </div>

            {(!currentModels.some((m) => m.id === model) || model === 'custom') && (
              <div className="pt-1 animate-fade-in">
                <input
                  type="text"
                  value={model === 'custom' ? '' : model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gemini-3.7-flash, gpt-4o, etc."
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 font-mono text-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
                />
              </div>
            )}
          </div>

          {/* Section 3: API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="api-key-input" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key className="w-4 h-4 text-brand-600" />
                <span>API Key</span>
              </label>

              <a
                href={getKeyHelpLink()}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1 font-medium"
              >
                <span>Get a {provider.toUpperCase()} key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative flex items-center">
              <input
                id="api-key-input"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder={`Enter your ${provider.toUpperCase()} API key...`}
                className="w-full px-4 py-2.5 pr-24 rounded-xl border border-slate-300 font-mono text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title={showApiKey ? 'Hide key' : 'Show key'}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!apiKey.trim() || isTesting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying connection...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
                    <span>Test API Connection</span>
                  </>
                )}
              </button>

              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                API key is stored in your private profile.
              </span>
            </div>

            {/* Test result message */}
            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="font-medium">{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Section 4: Topics Configuration */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label htmlFor="topics-input" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Learning Topics (Comma-separated)</span>
              </label>

              <button
                type="button"
                onClick={handleResetTopics}
                className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-semibold cursor-pointer hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Default</span>
              </button>
            </div>

            <textarea
              id="topics-input"
              rows={2}
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="e.g. Physics, Chemistry, Algebra, Calculus, History, Economics, Quantum Computing"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-sans text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none transition-all"
            />

            {/* Live Topics Preview */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Configured Topics ({parsedTopicsPreview.length}):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {parsedTopicsPreview.map((t) => (
                  <TopicBadge key={t} topic={t} size="sm" />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 text-sm font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Settings</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
