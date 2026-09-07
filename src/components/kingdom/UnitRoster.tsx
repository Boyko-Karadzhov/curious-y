import { useRef, useState } from 'react';
import { UnitPortrait } from './UnitPortrait';
import { Kingdom, UNITS, UnitId, unitDefinition, effectiveOwnedUnit, recruitLevel, xpProgress, battleSpeed, CURRENT_RULES, unitDamagePerSecond } from '../../lib/kingdom/game';
import './recruitment.css';

export function UnitRoster({ state }: { state: Kingdom }) {
  const [selected, select] = useState<UnitId>('militia');
  const detail = useRef<HTMLDivElement>(null);
  const unit = unitDefinition(selected);
  const id = Object.keys(state.units).find(id => state.units[id].unitId === selected);
  const owned = id ? state.units[id] : null;
  const stats = id ? effectiveOwnedUnit(state, id) : null;
  const progress = owned ? xpProgress(owned) : null;
  const active = !!state.battle && !state.battle.result;
  return <section className="rounded-2xl bg-slate-900 p-5 text-white" aria-label="Unit collection">
    <h2 className="text-lg font-bold">Unit collection · {state.discovered.length}/{UNITS.length} types</h2>
    <p className="mt-2 text-sm text-slate-300">Keep one unit per class. Recruitment at each building automatically merges recruits into your highest tier and preserves their XP. Battle losses never consume your roster.</p>
    {active && <p className="mt-2 text-sm text-amber-200">Recruitment and merging apply to your next battle. This battle keeps its original army snapshot.</p>}
    <div role="group" aria-label="Roster" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{UNITS.map(u => {
      const recruit = Object.values(state.units).find(r => r.unitId === u.id);
      return <button key={u.id} type="button" aria-pressed={selected===u.id} onClick={() => {select(u.id); requestAnimationFrame(()=>detail.current?.focus());}} className={`flex min-h-28 flex-col items-center rounded-xl border p-2 text-sm aria-pressed:border-amber-300 ${recruit ? 'border-slate-500' : 'border-slate-700 opacity-50'}`}><UnitPortrait id={u.id} size={48}/><strong>{u.name}</strong><span>Tier {u.tier} · {recruit ? `Level ${recruitLevel(recruit)}` : state.discovered.includes(u.id) ? 'Discovered' : 'Undiscovered'}</span></button>;
    })}</div>
    <div ref={detail} tabIndex={-1} role="region" className="mt-4 rounded-xl bg-slate-800 p-4" aria-label={`${unit.name} collection details`}>
      <h3 className="text-lg font-bold">{unit.name} · Tier {unit.tier}</h3>
      {!owned ? <p className="mt-2 text-sm">{state.discovered.includes(selected) ? 'This discovered type has been merged into your class unit.' : `Discover this type through ${unit.building} recruitment. Building levels improve your odds.`}</p> : <>
        <p className="mt-2">Level {progress!.level} · {progress!.current}/{progress!.required} XP toward level {progress!.level+1}</p>
        <progress aria-label="Unit training progress" className="w-full" value={progress!.current} max={progress!.required}/>
        <p className="text-sm">{stats!.hp} HP · {Number((unitDamagePerSecond(stats!)*battleSpeed(CURRENT_RULES)).toFixed(2))} damage/sec{stats!.healBudget ? ` · ${stats!.healBudget} healing budget` : ''}</p>
      </>}
    </div>
  </section>;
}
