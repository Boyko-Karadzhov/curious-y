import type { TopicName } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { hasAvailableCastleAction } from '../../lib/kingdom/availability';
import type { LearningShortcut } from '../../lib/kingdom/learningPath';
import { useKingdom } from '../../lib/kingdom/useKingdom';
import { useProgressionGoal } from '../../lib/kingdom/useProgressionGoal';
import { useAppDialogs } from './useAppDialogs';
import { useAppNavigation } from './useAppNavigation';
import { useLearningSession } from './useLearningSession';

export function useAppController() {
    const auth = useAuth();
    const settingsContext = useSettings();
    const dialogs = useAppDialogs();
    const navigation = useAppNavigation(dialogs.settingsOpen);
    const kingdom = useKingdom(auth.user?.id, auth.isDemoUser);
    const goalPreference = useProgressionGoal(
        auth.user?.id,
        kingdom.state,
        kingdom.unavailable,
        auth.isDemoUser,
    );
    const learning = useLearningSession({
        user: auth.user,
        isDemoUser: auth.isDemoUser,
        settings: settingsContext.settings,
        settingsLoading: settingsContext.loading,
        settingsError: settingsContext.error,
        kingdom,
        setView: navigation.setView,
        openSettings: dialogs.openSettings,
        closeHistory: dialogs.closeHistory,
    });

    const learnForGoal = (topic?: TopicName, shortcut?: LearningShortcut) => {
        if (learning.learningBlocked) {
            return;
        }

        navigation.focusLearn();
        learning.resetHome();
        const path = shortcut ?? (goalPreference.goal
            ? { kind: 'goal' as const, goal: goalPreference.goal }
            : undefined);
        void learning.fetchNewQuestion(topic, undefined, path, !!path && !topic);
    };

    const openConcepts = () => {
        learning.resetHome();
        learning.setKnowledgeOnly(true);
    };

    return {
        auth,
        settings: settingsContext,
        dialogs,
        navigation,
        kingdom,
        goalPreference,
        learning,
        learnForGoal,
        openConcepts,
        castleActionAvailable: !kingdom.unavailable && hasAvailableCastleAction(kingdom.state),
    };
}

export type AppController = ReturnType<typeof useAppController>;
