import React from 'react';
import { LoginModal } from './components/auth/LoginModal';
import { useAuth } from './context/AuthContext';
import { AppDialogs } from './app/components/AppDialogs';
import { AppFooter } from './app/components/AppFooter';
import { AppHeader } from './app/components/AppHeader';
import { AppLoadingScreen } from './app/components/AppLoadingScreen';
import { AppShell } from './app/components/AppShell';
import { AppStatusAlerts } from './app/components/AppStatusAlerts';
import { AppViewNavigation } from './app/components/AppViewNavigation';
import { useAppController } from './app/hooks/useAppController';
import { AppWorkspace } from './app/views/AppWorkspace';

export const AppContent: React.FC = () => {
    const app = useAppController();

    if (app.auth.loading) {
        return <AppLoadingScreen />;
    }

    if (!app.auth.user) {
        return <LoginModal />;
    }

    return (
        <AppShell>
            <AppHeader
                state={app.kingdom.state}
                unavailable={app.kingdom.unavailable}
                onOpenSettings={app.dialogs.openSettings}
                onOpenHistory={app.dialogs.openHistory}
                onOpenConcepts={app.openConcepts}
                onGoHome={app.learning.resetHome}
                onResetProgress={() => void app.learning.resetProgress()}
            />
            <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
                <AppViewNavigation
                    view={app.navigation.view}
                    state={app.kingdom.state}
                    unavailable={app.kingdom.unavailable}
                    isDemoUser={app.auth.isDemoUser}
                    castleActionAvailable={app.castleActionAvailable}
                    onViewChange={app.navigation.setView}
                />
                <AppStatusAlerts
                    kingdomError={app.kingdom.error}
                    kingdomUnavailable={app.kingdom.unavailable}
                    resetError={app.learning.resetError}
                    settingsError={app.settings.error}
                    isDemoUser={app.auth.isDemoUser}
                    onRetryKingdom={() => void app.kingdom.retryPending()}
                    onReloadKingdom={() => void app.kingdom.refresh()}
                />
                <AppWorkspace app={app} />
            </main>
            <AppFooter isDemoUser={app.auth.isDemoUser} />
            <AppDialogs
                settingsOpen={app.dialogs.settingsOpen}
                historyOpen={app.dialogs.historyOpen}
                onCloseSettings={app.dialogs.closeSettings}
                onCloseHistory={app.dialogs.closeHistory}
                onSelectHistory={app.learning.selectFromHistory}
                onResetProgress={() => void app.learning.resetProgress()}
            />
        </AppShell>
    );
};

export const App: React.FC = () => {
    const { user } = useAuth();
    return <AppContent key={user?.id ?? 'signed-out'} />;
};

export default App;
