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

  useEffect(() => {
    let active = true;
    setLoading(true);
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
        if (active) setSettings(EMPTY_SETTINGS);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [isDemoUser, user]);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!user) return;
    setSaving(true);
    try {
      const apiKey = updates.apiKey?.trim() ?? '';
      if (!apiKey) throw new Error('Enter a Gemini API key to save.');
      await saveServerGeminiKey(apiKey);
      setSettings({ apiKey: '', hasApiKey: true });
    } finally {
      setSaving(false);
    }
  }, [user]);

  const clearApiKey = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await deleteServerGeminiKey();
      setSettings(EMPTY_SETTINGS);
    } finally {
      setSaving(false);
    }
  }, [user]);

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      saving,
      updateSettings,
      clearApiKey,
      testConnection: testServerGeminiKey,
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
