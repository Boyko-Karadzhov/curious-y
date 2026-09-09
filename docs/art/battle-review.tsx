import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Battlefield } from '../../src/components/game/Battlefield';
import { BattleHud } from '../../src/components/game/BattleHud';
import { createBattle, newKingdom, stageLabel, unitStats, type Fighter } from '../../src/lib/kingdom/game';
import { battleTheme } from '../../src/lib/kingdom/battleArt';
import '../../src/index.css';

export function BattleReview() {
    const [world, setWorld] = useState(2);
    const [narrow, setNarrow] = useState(false);
    const [running, setRunning] = useState(true);
    const [clock, setClock] = useState(0);
    const stage = (world - 1) * 10 + 1;
    const theme = battleTheme(stage);
    useEffect(() => {
        if (!running) {
            return;
        }

        const timer = window.setInterval(() => setClock(time => time + .2), 200);
        return () => window.clearInterval(timer);
    }, [running]);
    const battle = useMemo(() => {
        const b = createBattle(newKingdom());
        b.stage = stage; b.elapsed = clock;
        const fighter = (kind: Fighter['kind'], id: number, side: Fighter['side'], x: number, injured = false): Fighter => {
            const stats = unitStats(kind, 1);
            return { ...stats, kind, id, side, x, hp: stats.hp * (injured ? .55 : 1), maxHp: stats.hp, healingLeft: stats.healBudget };
        };

        b.fighters = [fighter('swordsman', 1, 'player', 48, true), fighter('medic', 2, 'player', 40),
            fighter('swordsman', 3, 'enemy', 51, true), fighter('archer', 4, 'player', 31),
            fighter('medic', 5, 'enemy', 60), fighter('archer', 6, 'enemy', 72)];
        return b;
    }, [stage, clock]);
    return <main className="mx-auto max-w-6xl p-4 text-slate-100">
        <h1 className="text-2xl font-bold">Battle artwork review</h1>
        <p className="my-3 text-sm text-slate-300">Actual battlefield components with disposable sample fighters. No account or saved game changes.</p>
        <div className="mb-5 flex flex-wrap items-center gap-5">
            <label>World <select className="rounded bg-slate-800 p-2" value={world} onChange={event => setWorld(Number(event.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} · {battleTheme((n - 1) * 10 + 1).name}</option>)}
            </select></label>
            <label><input type="checkbox" checked={narrow} onChange={event => setNarrow(event.target.checked)} /> Narrow layout</label>
            <label><input type="checkbox" checked={running} onChange={event => setRunning(event.target.checked)} /> Animate healing</label>
        </div>
        <div className="mx-auto" style={{ maxWidth: narrow ? 390 : 1000 }}>
            <Battlefield battle={battle} running={running}>
                <BattleHud state={{ ...newKingdom(), battle, cleared: stage - 1 }} battle={battle} active blocked={false} unavailable={false} perform={async () => false} onLearn={() => undefined} />
            </Battlefield>
            <p className="mt-3 text-sm text-slate-300">Stage {stageLabel(stage)} · {theme.name}</p>
        </div>
    </main>;
}

createRoot(document.getElementById('root')!).render(<BattleReview />);
