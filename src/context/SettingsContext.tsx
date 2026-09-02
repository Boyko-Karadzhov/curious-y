import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserSettings, LLMProvider, PROVIDER_MODELS } from '../types';
import { useAuth } from './AuthContext';
import { getUserSettings, saveUserSettings } from '../services/database';
import { testLLMConnection } from '../lib/llm/factory';

interface SettingsContextType {
  settings: UserSettings;
  loading: boolean;
  saving: boolean;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  testConnection: (provider: LLMProvider, model: string, apiKey: string) => Promise<{ success: boolean; message: string }>;
}

const defaultSettings: UserSettings = {
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  apiKey: '',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) {
      setSettings(defaultSettings);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getUserSettings(user.id);
      
      // Ensure model is valid and migrate any deprecated/unavailable model IDs
      const DEPRECATED_MODELS = ['gemini-2.5-flash-lite', 'gemini-3.7-flash-lite'];
      if (!data.model || DEPRECATED_MODELS.includes(data.model)) {
        const available = PROVIDER_MODELS[data.provider] || [];
        const recommended = available.find((m) => m.recommended) || available[0];
        data.model = recommended?.id || 'gemini-3.5-flash-lite';
      }

      setSettings(data);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    if (!user) return;

    setSaving(true);
    try {
      const merged: UserSettings = {
        ...settings,
        ...newSettings,
      };

      // If provider changed and current model doesn't match the new provider, select default model
      if (newSettings.provider && newSettings.provider !== settings.provider) {
        const available = PROVIDER_MODELS[newSettings.provider] || [];
        const recommended = available.find((m) => m.recommended) || available[0];
        merged.model = newSettings.model || recommended?.id || '';
      }

      setSettings(merged);
      const saved = await saveUserSettings(user.id, merged);
      setSettings(saved);
    } catch (err) {
      console.error('Failed to save settings:', err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (provider: LLMProvider, model: string, apiKey: string) => {
    return await testLLMConnection(provider, model, apiKey);
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loading,
        saving,
        updateSettings,
        testConnection,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
