import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { UnitPortrait } from './UnitPortrait';
import { Action, battleSpeed, CURRENT_RULES, ArmySlots, Kingdom, UNIT_CLASSES, BUILDING_DEFINITIONS, UNITS, UnitId, effectiveOwnedUnit, eligibleUnit, formatCost, unitAbilityDescription, unitDamagePerSecond, unitUpgradeStatus, unlockBlocker, unlockDescription } from '../../lib/kingdom/game';

export function UnitRoster({ state, blocked, perform }: { state: Kingdom; blocked: boolean; perform: (action: Action) => Promise<boolean> }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, select] = useState<UnitId>('militia');
  const [destination, setDestination] = useState(0);
  const detail = useRef<HTMLDivElement>(null);
  const unit = UNITS.find(u => u.id === selected)!;
  const nextTier = UNITS.find(u => u.unitClass === unit.unitClass && u.tier === unit.tier + 1);
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
    <h2 className="text-lg font-bold"><button type="button" aria-expanded={expanded} aria-controls="unit-collection-content" onClick={() => setExpanded(!expanded)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">Unit collection · {Object.keys(state.units).length}/{UNITS.length}<ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 ${expanded ? 'rotate-180' : ''}`} /></button></h2>
    <div id="unit-collection-content" hidden={!expanded}>
    <p className="mt-2 text-sm text-slate-300">Five classes, five tiers each. Every next tier has 3× the health and damage (or healing), with the same class matchups, reach and recruitment speed. All unlocks are free.</p>
    <div role="group" aria-label="Roster" className="mt-4 space-y-5">
      {UNIT_CLASSES.map(c => <div key={c.id}><h3 className="font-bold">{c.name} · {BUILDING_DEFINITIONS.find(b => b.id === c.building)!.name}</h3><p className="mb-2 text-xs text-slate-300">{c.description}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {UNITS.filter(u => u.unitClass === c.id).map(u => <button key={u.id} type="button" aria-pressed={selected === u.id} aria-controls="roster-detail" onClick={() => {
        select(u.id); detail.current?.focus({ preventScroll: true });
        detail.current?.scrollIntoView({ block:'nearest', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }} className={`flex min-h-28 flex-col items-center rounded-xl border border-slate-600 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 aria-pressed:border-amber-300 aria-pressed:bg-slate-700 ${state.units[u.id] ? '' : 'grayscale opacity-50'}`}>
        <UnitPortrait id={u.id} size={64} /><span className="font-bold">{u.name}</span>
        <span className="text-xs text-slate-300">Tier {u.tier} · {3 ** (u.tier - 1)}× · {state.units[u.id] ? `Owned · L${state.units[u.id]!.level} / ${state.units[u.id]!.stars}★` : 'Locked'}</span>
      </button>)}</div></div>)}
    </div>
    <div id="roster-detail" ref={detail} tabIndex={-1} role="region" aria-label={`${unit.name} collection details`} className="mt-4 rounded-xl border border-slate-600 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300">
      <div className="flex items-center gap-3"><UnitPortrait id={unit.id} size={96} /><div><h3 className="font-bold">{unit.name} · Tier {unit.tier}/5</h3><p className="text-sm">{unit.role}</p></div></div>
      <p className="mt-2 text-sm text-sky-200">{unitAbilityDescription(unit.id)}</p>
      <p className="mt-2 text-xs text-slate-300">Unlock: {unlockDescription(selected)}.</p>
      <p className="mt-2 rounded-lg bg-slate-800 p-3 text-sm">{nextTier ? <>Next: <strong>{nextTier.name}</strong> · 3× base HP and {unit.unitClass === 'healer' ? 'healing' : 'damage'} · {unit.hp} → {nextTier.hp} base HP. Requires {unlockDescription(nextTier.id)}.</> : 'Highest tier of this class · 81× the starting unit’s base power.'}</p>
      {unit.unitClass === 'healer' && <p className="mt-2 text-sm text-emerald-200">Healing: {Number((stats.healPerSecond! * battleSpeed(CURRENT_RULES)).toFixed(2))} HP/sec · {Number(stats.healBudget!.toFixed(2))} HP lifetime budget</p>}
      <p className="mt-2 text-sm">{progress ? `Level ${progress.level}/5 · Stars ${progress.stars}/3` : `Level 1 / Star 1 preview at building level ${Math.max(state.buildings[unit.building], unit.unlock.building)}`} · {stats.hp} HP · {Number((unitDamagePerSecond(stats) * battleSpeed(CURRENT_RULES)).toFixed(2))} damage/sec · {stats.range} reach · recruits every {(stats.spawnInterval / battleSpeed(CURRENT_RULES)).toFixed(2)}s</p>
      <p className="mt-2 text-xs text-slate-300">Recruitment building levels add 30% base power per level. Training levels add 8% and stars add 6% per step. These smaller upgrades stack with the 3× unit tier progression. Library and Knowledge Towers add their bonuses.</p>
      {!progress ? <><p className="mt-3 text-sm text-amber-200">{locked ?? 'Milestones complete. Ready to unlock.'}</p><button type="button" disabled={blocked || active || !!locked} onClick={() => void perform({ type: 'unit-unlock', id: selected })} className="mt-2 min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:bg-slate-700 disabled:text-slate-400">Unlock {unit.name} · Free</button></> : <>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['unit-level', 'unit-star'] as const).map(type => {
          const status = unitUpgradeStatus(state, selected, type);
          const key = type === 'unit-level' ? 'level' : 'stars';
          const next = { ...progress, [key]: progress[key] + 1 };
          const preview = effectiveOwnedUnit({ ...state, units: { ...state.units, [selected]: next } }, selected);
          const capped = progress[key] >= (key === 'level' ? 5 : 3);
          return <div key={type} className="rounded-xl bg-slate-800 p-3"><p className="text-sm">{key === 'level' ? 'Level' : 'Stars'} {progress[key]}{!capped && ` → ${progress[key] + 1}: ${stats.hp} → ${preview.hp} HP, ${Number(((unit.unitClass === 'healer' ? stats.healPerSecond! : unitDamagePerSecond(stats)) * battleSpeed(CURRENT_RULES)).toFixed(2))} → ${Number(((unit.unitClass === 'healer' ? preview.healPerSecond! : unitDamagePerSecond(preview)) * battleSpeed(CURRENT_RULES)).toFixed(2))} ${unit.unitClass === 'healer' ? 'healing/sec' : 'damage/sec'}`}</p>
            {!capped && <p className="mt-1 text-xs">{formatCost(status.cost)}</p>}<p className="mt-1 text-xs text-amber-200">{status.blocker ?? (!status.ready ? 'Answer questions to earn the missing Resources.' : 'Ready to upgrade.')}</p>
            <button type="button" disabled={blocked || !status.ready} onClick={() => void perform({ type, id: selected, expected: progress[key] })} className="mt-2 min-h-11 rounded-lg bg-sky-800 px-3 text-sm font-bold disabled:opacity-40">{key === 'level' ? 'Level up' : 'Promote'} {unit.name}</button></div>;
        })}</div>
        <div className="mt-4 flex flex-wrap items-center gap-3"><label className="block w-full min-w-0 text-sm sm:w-auto">Army slot <select aria-label="Roster destination slot" className="mt-1 block min-h-11 max-w-full rounded-lg bg-slate-800 px-3" value={destination} onChange={event => setDestination(Number(event.target.value))}>{state.armySlots.map((id, i) => <option key={i} value={i}>{i + 1}: {UNITS.find(u => u.id === id)?.name ?? 'Empty'}</option>)}</select></label>
          <button type="button" disabled={blocked || active || equipped || !eligibleUnit(state, selected)} onClick={equip} className="min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:bg-slate-700 disabled:text-slate-400">{equipped ? `${unit.name} assigned` : `Equip ${unit.name}`}</button></div>
      </>}
      {active && <p className="mt-2 text-sm text-amber-200">Finish or retreat from the battle before changing the roster.</p>}
    </div>
    </div>
  </section>;
}
