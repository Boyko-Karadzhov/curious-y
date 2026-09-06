import { useRef, useState } from 'react';
import { Action, ArmySlots, Kingdom, UNITS, UnitId, effectiveOwnedUnit, eligibleUnit, formatCost, unitDamagePerSecond, unitUpgradeStatus, unlockBlocker, unlockDescription } from '../../lib/kingdom/game';

export function UnitRoster({ state, blocked, perform }: { state: Kingdom; blocked: boolean; perform: (action: Action) => Promise<boolean> }) {
  const [selected, select] = useState<UnitId>('swordsman');
  const [destination, setDestination] = useState(0);
  const detail = useRef<HTMLDivElement>(null);
  const unit = UNITS.find(u => u.id === selected)!;
  const progress = state.units[selected];
  const stats = effectiveOwnedUnit(progress ? state : { ...state, buildings: { ...state.buildings, [unit.building]: Math.max(state.buildings[unit.building], unit.unlock.building) } }, selected);
  const active = !!state.battle && !state.battle.result;
  const locked = unlockBlocker(state, selected);
  const equipped = state.armySlots.includes(selected);
  const equip = () => {
    const slots = [...state.armySlots] as ArmySlots; slots[destination] = selected;
    void perform({ type: 'army', slots });
  };
  return <section aria-label="Unit collection" className="rounded-2xl bg-slate-900 p-4 text-white sm:p-5">
    <h2 className="text-lg font-bold">Unit collection · {Object.keys(state.units).length}/{UNITS.length}</h2>
    <p className="mt-2 text-sm text-slate-300">Earn units through buildings, campaign victories and verified learning. All unlocks are free. Rarity describes specialization; it adds no stat multiplier.</p>
    <div role="group" aria-label="Roster" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
      {UNITS.map(u => <button key={u.id} type="button" aria-pressed={selected === u.id} aria-controls="roster-detail" onClick={() => {
        select(u.id); detail.current?.focus({ preventScroll: true });
        detail.current?.scrollIntoView({ block:'nearest', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }} className="flex min-h-28 flex-col items-center rounded-xl border border-slate-600 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 aria-pressed:border-amber-300 aria-pressed:bg-slate-700">
        <img src={u.asset} alt="" width="48" height="48" /><span className="font-bold">{u.name}</span>
        <span className="text-xs text-slate-300">{u.rarity} · {state.units[u.id] ? `Owned · L${state.units[u.id]!.level} / ${state.units[u.id]!.stars}★` : 'Locked'}</span>
      </button>)}
    </div>
    <div id="roster-detail" ref={detail} tabIndex={-1} role="region" aria-label={`${unit.name} collection details`} className="mt-4 rounded-xl border border-slate-600 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <div className="flex items-center gap-3"><img src={unit.asset} alt="" width="64" height="64" /><div><h3 className="font-bold">{unit.name} · {unit.rarity}</h3><p className="text-sm">{unit.role}</p></div></div>
      <p className="mt-2 text-sm text-sky-200">{unit.ability.description}</p>
      <p className="mt-2 text-xs text-slate-300">Tags: {unit.tags.join(', ')}. Unlock: {unlockDescription(selected)}.</p>
      <p className="mt-2 text-sm">{progress ? `Level ${progress.level}/5 · Stars ${progress.stars}/3` : `Level 1 / Star 1 preview at building level ${Math.max(state.buildings[unit.building], unit.unlock.building)}`} · {stats.hp} HP · {unitDamagePerSecond(stats)} damage/sec · {stats.range} reach · recruits every {stats.spawnInterval.toFixed(2)}s</p>
      <p className="mt-2 text-xs text-slate-300">Building tiers retain +30% base HP/damage per tier and their specialties. Unit levels add 8% and stars add 6% of those building stats per tier. Library HP and tag-based towers apply afterward. Current battles use frozen stats.</p>
      {!progress ? <><p className="mt-3 text-sm text-amber-200">{locked ?? 'Milestones complete. Ready to unlock.'}</p><button type="button" disabled={blocked || active || !!locked} onClick={() => void perform({ type: 'unit-unlock', id: selected })} className="mt-2 min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:bg-slate-700 disabled:text-slate-400">Unlock {unit.name} · Free</button></> : <>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['unit-level', 'unit-star'] as const).map(type => {
          const status = unitUpgradeStatus(state, selected, type);
          const key = type === 'unit-level' ? 'level' : 'stars';
          const next = { ...progress, [key]: progress[key] + 1 };
          const preview = effectiveOwnedUnit({ ...state, units: { ...state.units, [selected]: next } }, selected);
          const capped = progress[key] >= (key === 'level' ? 5 : 3);
          return <div key={type} className="rounded-xl bg-slate-800 p-3"><p className="text-sm">{key === 'level' ? 'Level' : 'Stars'} {progress[key]}{!capped && ` → ${progress[key] + 1}: ${stats.hp} → ${preview.hp} HP, ${unitDamagePerSecond(stats)} → ${unitDamagePerSecond(preview)} damage/sec`}</p>
            {!capped && <p className="mt-1 text-xs">{formatCost(status.cost)}</p>}<p className="mt-1 text-xs text-amber-200">{status.blocker ?? (!status.ready ? 'Earn the missing Gold and Resources.' : 'Ready to upgrade.')}</p>
            <button type="button" disabled={blocked || !status.ready} onClick={() => void perform({ type, id: selected, expected: progress[key] })} className="mt-2 min-h-11 rounded-lg bg-sky-800 px-3 text-sm font-bold disabled:opacity-40">{key === 'level' ? 'Level up' : 'Promote'} {unit.name}</button></div>;
        })}</div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><label className="block w-full min-w-0 text-sm sm:w-auto">Army slot <select aria-label="Roster destination slot" className="mt-1 block min-h-11 max-w-full rounded-lg bg-slate-800 px-3" value={destination} onChange={event => setDestination(Number(event.target.value))}>{state.armySlots.map((id, i) => <option key={i} value={i}>{i + 1}: {UNITS.find(u => u.id === id)?.name ?? 'Empty'}</option>)}</select></label>
          <button type="button" disabled={blocked || active || equipped || !eligibleUnit(state, selected)} onClick={equip} className="min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:bg-slate-700 disabled:text-slate-400">{equipped ? `${unit.name} assigned` : `Equip ${unit.name}`}</button></div>
      </>}
      {active && <p className="mt-2 text-sm text-amber-200">Finish or retreat from the battle before changing the roster.</p>}
    </div>
  </section>;
}
