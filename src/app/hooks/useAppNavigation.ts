import { useEffect, useRef, useState } from 'react';
import type { UpgradeAction } from '../../lib/kingdom/game';

export type AppView = 'battle' | 'castle' | 'learn';

export function useAppNavigation(settingsOpen: boolean) {
    const [view, setView] = useState<AppView>('battle');
    const [navigationFocus, setNavigationFocus] = useState(0);
    const upgradeDestination = useRef('kingdom-castle');
    const battleDestination = useRef('kingdom-battle');

    const openBattle = (slot?: number) => {
        battleDestination.current = slot === undefined ? 'kingdom-battle' : `army-square-${slot}`;
        setView('battle');
        setNavigationFocus(value => value + 1);
    };

    const navigateUpgrade = (action: UpgradeAction) => {
        upgradeDestination.current = action.type === 'castle' ? 'kingdom-castle' : `kingdom-building-${action.id}`;
        setView('castle');
        setNavigationFocus(value => value + 1);
    };

    const focusLearn = () => {
        setView('learn');
        setNavigationFocus(value => value + 1);
    };

    useEffect(() => {
        if (!navigationFocus || settingsOpen) {
            return;
        }

        const destination = view === 'learn'
            ? 'learning-deck'
            : view === 'battle'
                ? battleDestination.current
                : upgradeDestination.current;
        const target = document.getElementById(destination);
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({
            block: 'start',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    }, [navigationFocus, view, settingsOpen]);

    return { view, setView, openBattle, navigateUpgrade, focusLearn };
}
