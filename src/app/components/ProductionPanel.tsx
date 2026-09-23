import { useEffect, useState } from 'react';
import { Anvil, Coins, Wheat } from 'lucide-react';
import { availableProduction, BASE_GOLD, dailyTribute, FOOD_PER_FARM_LEVEL, type Action, type Kingdom } from '../../lib/kingdom/game';
import { HelpTip } from '../../components/common/HelpTip';
import { animateProductionCollection } from '../../components/game/collectResources';

export function ProductionPanel({ state, unavailable, act }: {
    state: Kingdom;
    unavailable: boolean;
    act: (action: Action) => Promise<boolean>
}) {
    const [now, setNow] = useState(() => new Date().toISOString());
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date().toISOString()), 60000); return () => window.clearInterval(timer);
    }, []);
    const ready = availableProduction(state, now);
    const total = Object.values(ready).reduce((sum, amount) => sum + amount, 0);
    const collect = async (source: HTMLButtonElement) => {
        setBusy(true);
        try {
            if (await act({ type: 'collect-production' })) {
                await animateProductionCollection(source, {
                    gold: ready.gold + ready.battle,
                    food: ready.food,
                    metal: ready.metal
                });
            }
        } finally {
            setBusy(false); setNow(new Date().toISOString());
        }
    };

    return <section aria-label="Income and offline rewards" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
                <h2 className="text-base font-extrabold">Income and offline rewards</h2>
                <HelpTip label="How income and offline rewards work">
                    <p>Daily Gold and Food refresh at 00:00 UTC. Any uncollected daily rewards are lost when the next day begins.</p>
                    <p>Metal stores up to 24 hours of production.</p>
                </HelpTip>
            </div>
            {(total > 0 || busy) && <button type="button" className="min-h-11 rounded-xl bg-amber-500 px-5 font-bold text-amber-950 disabled:opacity-40" disabled={unavailable || busy} onClick={event => void collect(event.currentTarget)}>{busy ? 'Collecting…' : 'Collect all'}</button>}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <p><strong className="inline-flex items-center gap-1"><Coins aria-hidden="true" className="h-4 w-4 text-amber-600" />Gold</strong> · {BASE_GOLD} base + {dailyTribute(state.cleared, state.buildings.treasury)} territory daily<br/><span className="text-amber-800">{unavailable ? '—' : ready.gold + ready.battle} ready{ready.battle ? ` (includes ${ready.battle} battle Gold)` : ''}</span></p>
            <p><strong className="inline-flex items-center gap-1"><Wheat aria-hidden="true" className="h-4 w-4 text-lime-700" />Food</strong> · {state.buildings.farm * FOOD_PER_FARM_LEVEL} daily from Farm<br/><span className="text-amber-800">{unavailable ? '—' : ready.food} ready</span></p>
            <p><strong className="inline-flex items-center gap-1"><Anvil aria-hidden="true" className="h-4 w-4 text-slate-600" />Metal</strong> · {state.buildings.smelter} per minute from Smelter<br/><span className="text-amber-800">{unavailable ? '—' : ready.metal} ready</span></p>
        </div>
    </section>;
}
