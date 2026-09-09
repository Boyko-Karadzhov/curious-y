import type { ReactNode } from 'react';
import { QuestRail } from '../../../components/game/QuestRail';
import type { AppController } from '../../hooks/useAppController';
import { LearningDeck } from './LearningDeck';

interface LearnViewProps {
    app: AppController;
    goalCard: ReactNode;
}

export function LearnView({ app, goalCard }: LearnViewProps) {
    const { kingdom, learning, navigation } = app;

    return (
        <div className="flex flex-col gap-5">
            <QuestRail
                castleActionAvailable={app.castleActionAvailable}
                onLearnTopic={app.learnForGoal}
                learningBlocked={kingdom.unavailable
                    ? 'Checking Castle progress…'
                    : learning.learningBlocked}
                pendingReward={learning.hasPendingReward}
                state={kingdom.state}
                onCastle={() => navigation.setView('castle')}
                goalCard={goalCard}
            />
            <LearningDeck app={app} />
        </div>
    );
}
