import { ProgressionGoalCard } from '../../components/game/ProgressionGoalCard';
import type { AppController } from '../hooks/useAppController';
import { BattleView } from './BattleView';
import { CastleView } from './CastleView';
import { LearnView } from './learn/LearnView';

export function AppWorkspace({ app }: { app: AppController }) {
    const { kingdom, goalPreference, learning, navigation, auth } = app;
    const goalCard = (
        <ProgressionGoalCard
            state={kingdom.state}
            goal={goalPreference.goal}
            onSelect={goalPreference.select}
            unavailable={kingdom.unavailable}
            preferenceError={goalPreference.error}
            preferenceLoaded={goalPreference.loaded}
            preferenceSaving={goalPreference.saving}
            onRetryPreference={auth.isDemoUser ? undefined : goalPreference.retry}
            learningBlocked={learning.learningBlocked}
            pendingReward={learning.hasPendingReward}
            onLearnTopic={app.learnForGoal}
            onBattle={() => navigation.openBattle()}
            onNavigateUpgrade={navigation.navigateUpgrade}
        />
    );

    switch (navigation.view) {
        case 'battle':
            return <BattleView app={app} />;
        case 'castle':
            return <CastleView app={app} goalCard={goalCard} />;
        case 'learn':
            return <LearnView app={app} goalCard={goalCard} />;
    }
}
