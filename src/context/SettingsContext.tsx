import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  deleteServerGeminiKey,
  getServerGeminiKeyStatus,
  saveServerGeminiKey,
  testServerGeminiKey,
} from '../services/backend';
import { UserSettings } from '../types';

interface SettingsContextType {
  settings: UserSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  clearApiKey: () => Promise<void>;
  testConnection: (apiKey?: string) => Promise<{ success: boolean; message: string }>;
}

const EMPTY_SETTINGS: UserSettings = { apiKey: '', hasApiKey: false };
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isDemoUser } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!user || isDemoUser) {
      setSettings(EMPTY_SETTINGS);
      setLoading(false);
      return () => { active = false; };
    }

    getServerGeminiKeyStatus()
      .then((hasApiKey) => {
        if (active) setSettings({ apiKey: '', hasApiKey });
      })
      .catch((error) => {
        console.error('Could not load Gemini key status:', error);
        if (active) {
          setSettings(EMPTY_SETTINGS);
          setError('Gemini key status is unavailable. Check the learning backend connection; your saved key has not been changed.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [isDemoUser, user]);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!user) return;
    if (isDemoUser) throw new Error('Sign in with Google to configure Gemini. Explorer demo uses sample content.');
    setSaving(true);
    try {
      const apiKey = updates.apiKey?.trim() ?? '';
      if (!apiKey) throw new Error('Enter a Gemini API key to save.');
      await saveServerGeminiKey(apiKey);
      setSettings({ apiKey: '', hasApiKey: true });
      setError(null);
    } finally {
      setSaving(false);
    }
  }, [user, isDemoUser]);

  const clearApiKey = useCallback(async () => {
    if (!user) return;
    if (isDemoUser) throw new Error('Sign in with Google to manage a saved Gemini key.');
    setSaving(true);
    try {
      await deleteServerGeminiKey();
      setSettings(EMPTY_SETTINGS);
    } finally {
      setSaving(false);
    }
  }, [user, isDemoUser]);

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      saving,
      error,
      updateSettings,
      clearApiKey,
      testConnection: isDemoUser ? async () => { throw new Error('Live Gemini connections are unavailable in Explorer demo. Sign in with Google first.'); } : testServerGeminiKey,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

// Context hooks intentionally live beside their provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
