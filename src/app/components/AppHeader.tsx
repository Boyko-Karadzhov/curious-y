import type { Kingdom } from '../../lib/kingdom/game';
import { ResourceBar } from '../../components/game/ResourceBar';
import { Navbar } from '../../components/layout/Navbar';

interface AppHeaderProps {
    state: Kingdom;
    unavailable: boolean;
    onOpenSettings: () => void;
    onOpenHistory: () => void;
    onOpenConcepts: () => void;
    onGoHome: () => void;
    onResetProgress: () => void;
}

export function AppHeader({
    state,
    unavailable,
    onOpenSettings,
    onOpenHistory,
    onOpenConcepts,
    onGoHome,
    onResetProgress,
}: AppHeaderProps) {
    return (
        <>
            <Navbar
                onOpenSettings={onOpenSettings}
                onOpenHistory={onOpenHistory}
                onOpenConcepts={onOpenConcepts}
                onGoHome={onGoHome}
                onResetProgress={onResetProgress}
            />
            <ResourceBar state={state} unavailable={unavailable} />
        </>
    );
}
