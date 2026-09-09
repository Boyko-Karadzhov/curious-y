import { BattlePanel } from '../../components/kingdom/BattlePanel';
import { FirstBarracksPrompt } from '../../components/game/FirstBarracksPrompt';
import { BUILDINGS } from '../../lib/kingdom/game';
import type { AppController } from '../hooks/useAppController';

export function BattleView({ app }: { app: AppController }) {
    const { kingdom, goalPreference, learning, navigation } = app;
    const goal = goalPreference.goal;
    const firstArmyPrompt = goalPreference.loaded
        && !kingdom.unavailable
        && goal?.type === 'building'
        && goal.id === 'barracks'
        && goal.level === 1
        && !kingdom.state.battle
        && kingdom.state.cleared === 0
        && !BUILDINGS.some(building => kingdom.state.buildings[building.id] > 0)
        ? (
            <FirstBarracksPrompt
                state={kingdom.state}
                learningBlocked={learning.learningBlocked}
                preferenceSaving={goalPreference.saving}
                pendingReward={learning.hasPendingReward}
                onLearn={() => app.learnForGoal(
                    kingdom.state.tokens.Life < 5 ? 'Life' : 'Earth & Space',
                )}
                onNavigateUpgrade={navigation.navigateUpgrade}
            />
        )
        : null;

    return (
        <BattlePanel
            state={kingdom.state}
            act={kingdom.act}
            unavailable={kingdom.unavailable}
            onLearn={() => app.learnForGoal()}
            firstArmyPrompt={firstArmyPrompt}
        />
    );
}
