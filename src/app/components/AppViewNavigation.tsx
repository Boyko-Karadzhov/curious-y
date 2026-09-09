import { BookOpen, Castle, Swords } from 'lucide-react';
import { AvailableActionIndicator } from '../../components/kingdom/AvailableActionIndicator';
import { dailyTribute, type Kingdom } from '../../lib/kingdom/game';
import type { AppView } from '../hooks/useAppNavigation';

interface AppViewNavigationProps {
    view: AppView;
    state: Kingdom;
    unavailable: boolean;
    isDemoUser: boolean;
    castleActionAvailable: boolean;
    onViewChange: (view: AppView) => void;
}

const inactive = 'bg-slate-100 text-slate-700';
const active = 'bg-brand-600 text-white';
const button = 'inline-flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-sm font-bold';

export function AppViewNavigation({
    view,
    state,
    unavailable,
    isDemoUser,
    castleActionAvailable,
    onViewChange,
}: AppViewNavigationProps) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 space-y-3">
            <nav aria-label="Battle, Castle and Learn" className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        aria-pressed={view === 'battle'}
                        onClick={() => onViewChange('battle')}
                        className={`${button} ${view === 'battle' ? active : inactive}`}
                    >
                        <Swords aria-hidden="true" className="h-4 w-4 shrink-0" />
                        Battle
                    </button>
                    <button
                        type="button"
                        aria-pressed={view === 'castle'}
                        aria-description={castleActionAvailable ? 'Castle actions available' : undefined}
                        onClick={() => onViewChange('castle')}
                        className={`${button} ${view === 'castle' ? active : inactive}`}
                    >
                        <Castle aria-hidden="true" className="h-4 w-4 shrink-0" />
                        Castle · Level {state.castle}
                        {castleActionAvailable && <AvailableActionIndicator label="Castle actions available" />}
                    </button>
                    <button
                        type="button"
                        aria-pressed={view === 'learn'}
                        onClick={() => onViewChange('learn')}
                        className={`${button} ${view === 'learn' ? active : inactive}`}
                    >
                        <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
                        Learn
                    </button>
                </div>
                <p className="text-sm font-bold text-amber-800">
                    Daily tribute: {unavailable ? '—' : dailyTribute(state.cleared, state.buildings.treasury)} Gold
                </p>
            </nav>
            <p className="text-xs text-slate-500">
                {isDemoUser
                    ? 'Explorer Demo · Castle progress saves to this browser.'
                    : 'Your Castle, Resources, and campaign save securely to your account.'}
            </p>
        </div>
    );
}
