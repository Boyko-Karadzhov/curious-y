import type { ReactNode } from 'react';
import { KingdomPanel } from '../../components/game/KingdomPanel';
import type { AppController } from '../hooks/useAppController';

interface CastleViewProps {
    app: AppController;
    goalCard: ReactNode;
}

export function CastleView({ app, goalCard }: CastleViewProps) {
    const { kingdom, goalPreference, learning, navigation } = app;

    return (
        <KingdomPanel
            onLearnTopic={app.learnForGoal}
            learningBlocked={learning.learningBlocked}
            pendingReward={learning.hasPendingReward}
            state={kingdom.state}
            act={kingdom.act}
            unavailable={kingdom.unavailable}
            serverBacked={kingdom.serverBacked}
            onLearn={shortcut => app.learnForGoal(undefined, shortcut)}
            onPrepareArmy={navigation.openBattle}
            goalCard={goalCard}
            onSelectGoal={goalPreference.loaded && !goalPreference.saving
                ? goalPreference.select
                : undefined}
        />
    );
}
