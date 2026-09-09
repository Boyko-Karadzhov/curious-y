import { useState } from 'react';
import { UnitPortrait, portraitEquipment } from './UnitPortrait';
import { Action, Kingdom, UNITS, unitDefinition, recruitLevel, xpProgress, innateXP } from '../../lib/kingdom/game';

export function UnitRoster({ state, perform, blocked = false }: { state: Kingdom; perform?: (action: Action) => Promise<boolean>; blocked?: boolean }) {
    const [recipient, select] = useState('');
    const [donors, setDonors] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const copies = Object.entries(state.units);
    const owned = state.units[recipient];
    const candidates = owned ? copies.filter(([id, r]) => id !== recipient && !r.locked && !state.armySlots.includes(id) && unitDefinition(r.unitId).unitClass === unitDefinition(owned.unitId).unitClass) : [];
    const selected = candidates.filter(([id]) => donors.includes(id));
    const gain = selected.reduce((xp, [, r]) => xp + innateXP(r.unitId) + r.investedXP, 0);
    const progress = owned ? xpProgress(owned) : null;
    const after = owned ? xpProgress({ ...owned, investedXP: owned.investedXP + gain }) : null;
    const run = async (action: Action) => {
        if (!perform || busy || blocked) return;
        setBusy(true); setNotice('');
        try {
            if (await perform(action) && action.type === 'merge') {
                setDonors([]); setNotice(`Merged ${selected.length} copies · +${gain} XP · Level ${after!.level}.`);
            }
        } finally { setBusy(false); }
    };
    return <section className="rounded-2xl bg-slate-900 p-5 text-white" aria-label="Unit collection">
        <h2 className="text-lg font-bold">Unit collection · {state.discovered.length}/{UNITS.length} types · {copies.length} copies</h2>
        <p className="mt-2 text-sm text-slate-300">Keep duplicates to fill multiple army slots, or merge spare copies of the same class into a chosen unit. Equipped and locked copies cannot be consumed. Battle losses never consume your roster.</p>
        <div role="group" aria-label="Owned copies" className="mt-4 grid max-h-96 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-5">{copies.map(([id, r], index) => <button key={id} type="button" aria-pressed={recipient === id} onClick={() => { select(id); setDonors([]); setNotice(''); }} className="flex min-h-28 flex-col items-center rounded-xl border border-slate-600 p-2 text-sm aria-pressed:border-amber-300">
            <UnitPortrait id={r.unitId} size={48} equipment={portraitEquipment(state, r.unitId)} /><strong>{unitDefinition(r.unitId).name} · #{index + 1}</strong><span>Tier {unitDefinition(r.unitId).tier} · Level {recruitLevel(r)}</span><span className="text-xs text-sky-200">{state.armySlots.includes(id) ? 'Equipped' : r.locked ? 'Protected' : 'Available'}</span>
        </button>)}</div>
        {!copies.length && <p className="mt-4">Recruit your first pack at the Recruitment Hall.</p>}
        {owned && <div className="mt-4 rounded-xl bg-slate-800 p-4" role="region" aria-label="Merge copies">
            <h3 className="font-bold">Strengthen {unitDefinition(owned.unitId).name} · Level {progress!.level}</h3>
            <p className="mt-1 text-sm">{progress!.current}/{progress!.required} XP toward level {progress!.level + 1}</p>
            <button type="button" disabled={busy || blocked || !perform} onClick={() => void run({ type: 'lock', id: recipient, locked: !owned.locked })} className="min-h-11 text-sm text-amber-200 underline">{owned.locked ? 'Unprotect copy' : 'Protect copy from merging'}</button>
            <p className="text-sm">Choose spare copies to consume. Their innate and invested XP transfer to this recipient; its tier stays the same.</p>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{candidates.map(([id,r]) => <label key={id} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-600 p-2 text-sm"><input type="checkbox" checked={donors.includes(id)} onChange={e => setDonors(e.target.checked ? [...donors,id] : donors.filter(d => d !== id))} /><span>{unitDefinition(r.unitId).name} · #{copies.findIndex(([copy]) => copy === id) + 1} · Level {recruitLevel(r)} · +{innateXP(r.unitId) + r.investedXP} XP</span></label>)}</div>
            {!candidates.length && <p className="mt-2 text-sm text-slate-400">No unprotected spare copies of this class. Equip your first army before merging extras.</p>}
            {selected.length > 0 && <p className="mt-3 text-sm text-amber-200">Consume {selected.length} copies → +{gain} XP · Level {progress!.level} → {after!.level} · {after!.current}/{after!.required} XP.</p>}
            <button type="button" disabled={!selected.length || busy || blocked || !perform} onClick={() => void run({ type: 'merge', recipient, donors: selected.map(([id]) => id) })} className="mt-3 min-h-11 rounded-lg bg-amber-300 px-4 font-bold text-slate-950 disabled:opacity-40">{busy ? 'Saving…' : `Consume ${selected.length} selected copies & merge`}</button>
            <p role="status" className="mt-2 text-sm text-emerald-300">{notice}</p>
        </div>}
        <details className="mt-4 text-sm"><summary className="min-h-11 cursor-pointer py-3">Discovery album · {state.discovered.length}/{UNITS.length}</summary><div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{UNITS.map(u => <div key={u.id} className={`rounded-lg bg-slate-800 p-2 text-center ${state.discovered.includes(u.id) ? '' : 'opacity-40'}`}><UnitPortrait id={u.id} size={40} /><p>{u.name}</p><small>Tier {u.tier} · {state.discovered.includes(u.id) ? 'Discovered' : 'Undiscovered'}</small></div>)}</div></details>
    </section>;
}
