import { useCallback, useState } from 'react';

export function useAppDialogs() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    return {
        settingsOpen,
        historyOpen,
        openSettings: useCallback(() => setSettingsOpen(true), []),
        closeSettings: useCallback(() => setSettingsOpen(false), []),
        openHistory: useCallback(() => setHistoryOpen(true), []),
        closeHistory: useCallback(() => setHistoryOpen(false), []),
    };
}
