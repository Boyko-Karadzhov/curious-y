import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Action, battleSpeed, battleSeconds, ArmySlots, Battle, Kingdom, unitDefinition, recruitLevel, eligibleUnit, effectiveOwnedUnit, effectDescription, unitAbilityDescription, unitDamagePerSecond } from '../../lib/kingdom/game';

import { UnitPortrait, portraitEquipment } from './UnitPortrait';

export function ArmyPreparation({ state, preparation, active, blocked, perform }: {
  state: Kingdom; preparation: Battle; active: boolean; blocked: boolean; perform: (action: Action) => Promise<boolean>;
}) {
    const [slot, setSlot] = useState<number | null>(null);
    const [candidate, setCandidate] = useState<string | null>(null);
    const details = useRef<HTMLDivElement>(null);
    const squares = useRef<(HTMLButtonElement | null)[]>([]);
    const assignmentPending = useRef(false);
    const owned = Object.entries(state.units).map(([id,r]) => ({...unitDefinition(r.unitId), id, unitId:r.unitId}));
    const available = owned.filter(u => eligibleUnit(state, u.id) && !state.armySlots.includes(u.id));
    const empty = state.armySlots.indexOf(null);
    const suggest = empty !== -1 && available.length > 0;
    const unit = owned.find(u => u.id === candidate);
    const stats = unit ? (active ? preparation.config.slots.find(u => u?.id === unit.unitId) : effectiveOwnedUnit(state, unit.id)) : null;
    useEffect(() => {
        if (slot === null) {
            return;
        }
        details.current?.focus({ preventScroll: true });
        details.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, [slot]);
    const close = () => {
        if (slot !== null) {
            squares.current[slot]?.focus();
        } setSlot(null); 
    };
    const assign = async (id: string | null) => {
        if (slot === null || active || blocked || assignmentPending.current) {
            return;
        }
        if (id && (!eligibleUnit(state, id) || state.armySlots.some((assigned, index) => assigned === id && index !== slot))) {
            return;
        }
        setCandidate(id);
        if (state.armySlots[slot] === id) {
            return;
        }
        const slots = [...state.armySlots] as ArmySlots;
        slots[slot] = id;
        assignmentPending.current = true;
        try {
            if (await perform({ type: 'army', slots }) && id === null) {
                close();
            }
        } finally {
            assignmentPending.current = false;
        }
    };
    return <>
        {suggest && <p role="status" className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-200">{available.map(u => u.name).join(', ')} available. {active ? 'After this battle, click' : 'Click'} empty square {empty + 1} to assign a unit.</p>}
        <div className="mt-4 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-5">
            {state.armySlots.map((id, index) => <button key={index} id={`army-square-${index}`} ref={node => {
                squares.current[index] = node; 
            }} type="button"
            aria-label={`Army slot ${index + 1}: ${owned.find(u => u.id === id)?.name ?? 'Empty'}`} aria-expanded={slot === index} aria-controls="army-slot-details"
            onClick={() => {
                setCandidate(id); setSlot(index); 
            }}
            className={`flex aspect-square min-w-0 flex-col items-center justify-center rounded-2xl border-2 p-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300 ${slot === index ? 'border-sky-300 bg-slate-700' : suggest && index === empty ? 'border-amber-300 bg-amber-300/10 hover:bg-amber-300/20' : 'border-slate-700 bg-slate-800 hover:bg-slate-700'}`}>
                {id ? <UnitPortrait id={state.units[id].unitId} equipment={active ? preparation.config.slots[index]?.equipment : portraitEquipment(state, state.units[id].unitId)} /> : <Plus aria-hidden="true" className="my-5 h-10 w-10 text-slate-400" />}
                <span>{owned.find(u => u.id === id)?.name ?? 'Empty'}</span>
            </button>)}
        </div>
        {slot !== null && <div id="army-slot-details" ref={details} tabIndex={-1} role="region" aria-label={`Army slot ${slot + 1} details`} onKeyDown={event => {
            if (event.key === 'Escape') {
                close();
            } 
        }} className="mt-4 rounded-2xl border border-slate-600 bg-slate-800 p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Army slot {slot + 1}</h3><button type="button" aria-label="Close unit details" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-slate-700"><X className="h-5 w-5" /></button></div>
            {unit && stats ? <div className="mb-4">
                {unit.unitClass === 'swarm' && <p className="mb-2 text-sm text-amber-200">Five creatures per deployment share one capacity point. Stats below are per creature.</p>}
                <div className="flex items-center gap-2"><UnitPortrait id={unit.unitId} equipment={active ? stats.equipment : portraitEquipment(state, unit.unitId)} /><div><h4 className="font-bold">{unit.name} · Level {recruitLevel(state.units[unit.id])}</h4><p className="text-sm text-slate-300">{unit.role}</p><p className="text-xs text-sky-200">{unitAbilityDescription(unit.unitId, preparation.config.rulesVersion)}</p></div></div>
                <p className="mb-3 text-sm text-emerald-200">{active && preparation.config.rulesVersion < 3 ? 'Legacy battle: original stats; specialties begin next battle.' : active ? `Battle snapshot: ${Number(((stats.armor ?? 0) * 100).toFixed(2))}% armor · ${stats.range} reach · ${battleSeconds(preparation, stats.attackInterval ?? 0)}s reload` : effectDescription('barracks', state.buildings.barracks)}</p>
                {stats.healBudget ? <p className="mb-2 text-sm">Healing: {Number(((stats.healPerSecond ?? 0) * battleSpeed(preparation.config.rulesVersion)).toFixed(2))} HP/sec · {Number(stats.healBudget.toFixed(2))} HP per healer maximum</p> : null}
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">{[['Health', `${stats.hp} HP`], ['Damage', `${Number((unitDamagePerSecond(stats) * battleSpeed(preparation.config.rulesVersion)).toFixed(2))}/sec`], ['Range', stats.range], ['Speed', `${Number((stats.speed * battleSpeed(preparation.config.rulesVersion)).toFixed(2))}/sec`], ['Recruits', `Every ${battleSeconds(preparation, stats.spawnInterval)}s`], ['Castle damage', `${stats.castleMultiplier}×`], ['Armor', `${Number(((stats.armor ?? 0) * 100).toFixed(2))}%`], ['Splash', `${Number(((stats.splashFraction ?? 0) * 100).toFixed(2))}%`]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-900 p-2"><dt className="text-xs text-slate-400">{label}</dt><dd className="font-bold">{value}</dd></div>)}</dl>
            </div> : <p className="mb-4 text-sm text-slate-300">Choose an available unit to see its stats and assign it here.</p>}
            {active ? <p className="text-sm text-amber-200">Finish or retreat from the battle to change units.</p> : <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5" role="group" aria-label="Available units">{owned.map(u => {
                    const assignedElsewhere = state.armySlots.some((id,i) => i !== slot && id === u.id);
                    return <button type="button" key={u.id} disabled={blocked || !eligibleUnit(state, u.id) || assignedElsewhere} aria-pressed={candidate === u.id} onClick={() => void assign(u.id)} className="flex min-h-28 min-w-0 flex-col items-center justify-center rounded-xl border border-slate-500 p-2 text-sm enabled:hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 aria-pressed:border-sky-300 aria-pressed:bg-sky-900 disabled:grayscale disabled:opacity-40"><UnitPortrait id={u.unitId} equipment={portraitEquipment(state, u.unitId)} /><span className="font-bold">{u.name} · L{recruitLevel(state.units[u.id])} · #{owned.indexOf(u)+1}{assignedElsewhere ? ' · assigned' : ''}</span></button>;
                })}</div>
                {owned.length === 0 && <p className="text-sm text-slate-300">Recruit units in Castle to prepare your army.</p>}
                {state.armySlots[slot] && <button type="button" disabled={blocked} onClick={() => void assign(null)} className="mt-4 min-h-11 px-3 text-sm text-slate-300 underline disabled:opacity-50">Empty this slot</button>}
            </>}
        </div>}
    </>;
}
