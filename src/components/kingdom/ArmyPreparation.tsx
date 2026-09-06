import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Action, ArmySlots, Battle, Kingdom, UnitId, UNITS, eligibleUnit, unitStats, libraryModifiers, effectDescription, unitDamagePerSecond } from '../../lib/kingdom/game';

// Show the first idle frame from the same artwork used on the battlefield.
function UnitPortrait({ id }: { id: UnitId }) {
  if (id === 'medic') return <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center text-5xl text-emerald-300">✚</span>;
  const asset = id === 'swordsman' ? 'tiny-swords/warrior-blue.png' : id === 'archer' ? 'tiny-swords/archer-blue.png' : id === 'knight' ? 'battle/horse-blue.svg' : 'battle/catapult-blue.svg';
  const infantry = id === 'swordsman' || id === 'archer';
  const size = id === 'swordsman' ? '1200% 1600%' : id === 'archer' ? '1600% 1400%' : id === 'catapult' ? '800% 100%' : '80% 80%';
  return <span aria-hidden="true" className="pixel-art relative block h-20 w-20 shrink-0 bg-no-repeat" style={{ backgroundImage: `url(/assets/${asset})`, backgroundSize: size, backgroundPosition: infantry ? '-40px -40px' : id === 'knight' ? 'center bottom' : '0 0' }}>
    {id === 'knight' && <span className="absolute -top-3 left-0 h-20 w-20 bg-no-repeat" style={{ backgroundImage: 'url(/assets/tiny-swords/warrior-blue.png)', backgroundSize: '600% 800%' }} />}
  </span>;
}

export function ArmyPreparation({ state, preparation, active, blocked, perform }: {
  state: Kingdom; preparation: Battle; active: boolean; blocked: boolean; perform: (action: Action) => Promise<boolean>;
}) {
  const [slot, setSlot] = useState<number | null>(null);
  const [candidate, setCandidate] = useState<UnitId | null>(null);
  const details = useRef<HTMLDivElement>(null);
  const squares = useRef<(HTMLButtonElement | null)[]>([]);
  const available = UNITS.filter(u => eligibleUnit(state, u.id) && !state.armySlots.includes(u.id));
  const empty = state.armySlots.indexOf(null);
  const suggest = empty !== -1 && available.length > 0;
  const unit = UNITS.find(u => u.id === candidate);
  const stats = unit ? (active ? preparation.config.slots.find(u => u?.id === candidate) : unitStats(unit.id, state.buildings[unit.building], undefined, libraryModifiers(state))) : null;
  useEffect(() => {
    if (slot === null) return;
    details.current?.focus({ preventScroll: true });
    details.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [slot]);
  const close = () => { if (slot !== null) squares.current[slot]?.focus(); setSlot(null); };
  const assign = async (id: UnitId | null) => {
    if (slot === null || active || blocked) return;
    const slots = [...state.armySlots] as ArmySlots;
    slots[slot] = id;
    if (await perform({ type: 'army', slots })) close();
  };
  return <>
    {suggest && <p role="status" className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-200">{available.map(u => u.name).join(', ')} available. {active ? 'After this battle, click' : 'Click'} empty square {empty + 1} to assign a unit.</p>}
    <div className="mt-4 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
      {state.armySlots.map((id, index) => <button key={index} id={`army-square-${index}`} ref={node => { squares.current[index] = node; }} type="button"
        aria-label={`Army slot ${index + 1}: ${UNITS.find(u => u.id === id)?.name ?? 'Empty'}`} aria-expanded={slot === index} aria-controls="army-slot-details"
        onClick={() => { setCandidate(id); setSlot(index); }}
        className={`flex aspect-square min-w-0 flex-col items-center justify-center rounded-2xl border-2 p-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 ${slot === index ? 'border-sky-300 bg-slate-700' : suggest && index === empty ? 'border-amber-300 bg-amber-300/10 hover:bg-amber-300/20' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}>
        {id ? <UnitPortrait id={id} /> : <Plus aria-hidden="true" className="my-5 h-10 w-10 text-slate-400" />}
        <span>{UNITS.find(u => u.id === id)?.name ?? 'Empty'}</span>
      </button>)}
    </div>
    {slot !== null && <div id="army-slot-details" ref={details} tabIndex={-1} role="region" aria-label={`Army slot ${slot + 1} details`} onKeyDown={event => { if (event.key === 'Escape') close(); }} className="mt-4 rounded-2xl border border-slate-600 bg-slate-800 p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Army slot {slot + 1}</h3><button type="button" aria-label="Close unit details" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-700"><X className="h-5 w-5" /></button></div>
      {unit && stats ? <div className="mb-4">
        <div className="flex items-center gap-2"><UnitPortrait id={unit.id} /><div><h4 className="font-bold">{unit.name} · Level {state.buildings[unit.building]}</h4><p className="text-sm text-slate-300">{unit.role}</p></div></div>
        <p className="mb-3 text-sm text-emerald-200">{active && preparation.config.rulesVersion < 3 ? 'Legacy battle: original stats; specialties begin next battle.' : effectDescription(unit.building, state.buildings[unit.building])}</p>
        {stats.healBudget ? <p className="mb-2 text-sm">Healing: {stats.healPerSecond} HP/sec · {stats.healBudget} HP per Medic maximum</p> : null}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{[['Health', `${stats.hp} HP`], ['Damage', `${unitDamagePerSecond(stats)}/sec`], ['Range', stats.range], ['Speed', `${Number(stats.speed.toFixed(2))}/sec`], ['Recruits', `Every ${stats.spawnInterval}s`], ['Castle damage', `${stats.castleMultiplier}×`]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-900 p-2"><dt className="text-xs text-slate-400">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
      </div> : <p className="mb-4 text-sm text-slate-300">Choose an available unit to see its stats and assign it here.</p>}
      {active ? <p className="text-sm text-amber-200">Finish or retreat from the battle to change units.</p> : <>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Available units">{UNITS.map(u => <button type="button" key={u.id} disabled={blocked || !eligibleUnit(state, u.id) || (state.armySlots.includes(u.id) && state.armySlots[slot] !== u.id)} aria-pressed={candidate === u.id} onClick={() => setCandidate(u.id)} className="min-h-11 rounded-xl border border-slate-500 px-3 text-sm hover:bg-slate-700 aria-pressed:border-sky-300 aria-pressed:bg-sky-900 disabled:opacity-40">{u.name}{!eligibleUnit(state, u.id) ? ' · building required' : state.armySlots.includes(u.id) && state.armySlots[slot] !== u.id ? ' · assigned' : ''}</button>)}</div>
        <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={blocked || !candidate || state.armySlots[slot] === candidate} onClick={() => void assign(candidate)} className="min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:bg-slate-700 disabled:text-slate-400">Assign {unit?.name ?? 'unit'}</button>
          {state.armySlots[slot] && <button type="button" disabled={blocked} onClick={() => void assign(null)} className="min-h-11 px-3 text-sm text-slate-300 underline disabled:opacity-50">Empty this slot</button>}</div>
      </>}
    </div>}
  </>;
}
