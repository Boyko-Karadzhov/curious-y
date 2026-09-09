import type { HistoryItem } from '../../types';
import { HistoryModal } from '../../components/history/HistoryModal';
import { SettingsModal } from '../../components/settings/SettingsModal';

interface AppDialogsProps {
    settingsOpen: boolean;
    historyOpen: boolean;
    onCloseSettings: () => void;
    onCloseHistory: () => void;
    onSelectHistory: (item: HistoryItem) => void;
    onResetProgress: () => void;
}

export function AppDialogs({
    settingsOpen,
    historyOpen,
    onCloseSettings,
    onCloseHistory,
    onSelectHistory,
    onResetProgress,
}: AppDialogsProps) {
    return (
        <>
            <SettingsModal
                isOpen={settingsOpen}
                onClose={onCloseSettings}
                onResetProgress={onResetProgress}
            />
            <HistoryModal
                isOpen={historyOpen}
                onClose={onCloseHistory}
                onSelectQuestion={onSelectHistory}
                onResetProgress={onResetProgress}
            />
        </>
    );
}
