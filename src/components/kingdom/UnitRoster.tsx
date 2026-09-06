import { useEffect, useRef, useState } from 'react';
import { UnitPortrait } from './UnitPortrait';
import { Action, ArmySlots, Kingdom, UNITS, UnitId, unitDefinition, effectiveOwnedUnit, recruitLevel, xpProgress, spareDonors, mergeFingerprint, previewMerge, MergeIntent, battleSpeed, CURRENT_RULES, unitDamagePerSecond } from '../../lib/kingdom/game';
import './recruitment.css';

export function UnitRoster({ state, blocked, perform }: { state: Kingdom; blocked: boolean; perform: (action: Action) => Promise<boolean> }) {
  const [selected,select] = useState<UnitId>('militia');
  const [recipient,setRecipient] = useState('');
  const [donors,setDonors] = useState<string[]>([]);
  const [replace,setReplace] = useState<string>();
  const [intent,setIntent] = useState<MergeIntent | null>(null);
  const [advanced,setAdvanced] = useState(false);
  const [destination,setDestination] = useState(0);
  const [error,setError] = useState('');
  const [result,setResult] = useState<Kingdom['lastResult']>(null);
  const detail = useRef<HTMLDivElement>(null);
  const pending = useRef(false), seen = useRef(state.lastResult?.requestId);
  const unit = unitDefinition(selected);
  const copies = Object.entries(state.units).filter(([,r]) => r.unitId === selected).sort((a,b) => b[1].investedXP-a[1].investedXP);
  const id = state.units[recipient]?.unitId === selected ? recipient : copies[0]?.[0];
  const owned = state.units[id], stats = owned ? effectiveOwnedUnit(state,id) : null;
  const progress = owned ? xpProgress(owned) : null;
  const family = Object.entries(state.units).filter(([key,r]) => key !== id && unitDefinition(r.unitId).building === unit.building);
  const active = !!state.battle && !state.battle.result;
  let preview: ReturnType<typeof previewMerge> | null = null, stale = '';
  if (intent) { try { preview = previewMerge(state,intent); } catch(e) { stale = (e as Error).message; } }
  const afterStats = preview && intent ? effectiveOwnedUnit({...state,units:{...state.units,[intent.recipient]:preview.after}},intent.recipient) : null;
  useEffect(() => {
    const committed = (event: Event) => {
      const r = (event as CustomEvent<NonNullable<Kingdom['lastResult']>>).detail;
      if (r.requestId === seen.current) return;
      seen.current = r.requestId;
      if (r.type === 'merge') setResult(r);
    };
    window.addEventListener('curious-y-roster-result',committed);
    return () => window.removeEventListener('curious-y-roster-result',committed);
  },[]);
  const run = async (action: Action) => {
    if (pending.current || blocked) return false;
    pending.current=true; setError('');
    try { const ok = await perform(action); if (!ok) setError('Could not save. Retry this action.'); return ok; }
    catch(e) { setError((e as Error).message); return false; }
    finally { pending.current=false; }
  };
  const prepare = (chosen: string[], replacement?: string) => {
    const next = {recipient:id, donors:[...chosen], expected:mergeFingerprint(state,id,chosen), ...(replacement ? {replace:replacement} : {})};
    try { previewMerge(state,next); setIntent(next); setError(''); } catch(e) { setError((e as Error).message); }
  };
  const changeRecipient = (next: string) => { setRecipient(next); setIntent(null); setDonors([]); setReplace(undefined); };
  return <section className="rounded-2xl bg-slate-900 p-5 text-white" aria-label="Unit collection">
    <h2 className="text-lg font-bold">Unit collection · {state.discovered.length}/{UNITS.length} types</h2>
    <p className="mt-2 text-sm text-slate-300">Recruit in Castle. Merge spare recruits to train one chosen unit. Tier is its identity; level is its training. Battle losses never consume your roster.</p>
    {active && <p className="mt-2 text-sm text-amber-200">Recruitment and merging apply to your next battle. This battle keeps its original army snapshot.</p>}
    <div role="group" aria-label="Roster" className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">{UNITS.map(u => {
      const count = Object.values(state.units).filter(r => r.unitId === u.id).length;
      return <button key={u.id} type="button" aria-pressed={selected===u.id} onClick={() => {select(u.id); changeRecipient(''); requestAnimationFrame(()=>detail.current?.focus());}} className={`flex min-h-28 flex-col items-center rounded-xl border p-2 text-sm aria-pressed:border-amber-300 ${count ? 'border-slate-500' : 'border-slate-700 opacity-50'}`}><UnitPortrait id={u.id} size={48}/><strong>{u.name}</strong><span>Tier {u.tier} · {count ? `×${count}` : state.discovered.includes(u.id) ? 'Owned ×0' : 'Undiscovered'}</span></button>;
    })}</div>
    <div ref={detail} tabIndex={-1} role="region" className="mt-4 rounded-xl bg-slate-800 p-4" aria-label={`${unit.name} collection details`}>
      <h3 className="text-lg font-bold">{unit.name} · Tier {unit.tier}</h3>
      {!owned ? <p className="mt-2 text-sm">Discover this type through {unit.building} recruitment. Building levels improve your odds.</p> : <>
        <label className="mt-3 block text-sm">Recipient copy<select aria-label="Recipient copy" value={id} onChange={e => changeRecipient(e.target.value)} className="ml-2 max-w-full rounded bg-slate-900 p-2">{copies.map(([key,r],i) => <option key={key} value={key}>Copy {i+1} · Level {recruitLevel(r)} · {r.investedXP} XP{r.locked ? ' · Locked' : ''}{state.armySlots.includes(key) ? ' · Equipped' : ''}</option>)}</select></label>
        <p className="mt-2">Level {progress!.level} · {progress!.current}/{progress!.required} XP toward level {progress!.level+1}</p>
        <progress aria-label="Unit training progress" className="w-full" value={progress!.current} max={progress!.required}/>
        <p className="text-sm">{stats!.hp} HP · {Number((unitDamagePerSecond(stats!)*battleSpeed(CURRENT_RULES)).toFixed(2))} damage/sec{stats!.healBudget ? ` · ${stats!.healBudget} healing budget` : ''}</p>
        <button className="min-h-11 px-3 text-sm underline" disabled={blocked} onClick={() => void run({type:'lock',id,locked:!owned.locked,expected:owned.locked})}>{owned.locked ? 'Unlock recruit' : 'Lock recruit'}</button>
        <label className="text-sm">Army slot<select aria-label="Equip destination" value={destination} onChange={e => setDestination(Number(e.target.value))} className="ml-2 rounded bg-slate-900 p-2">{state.armySlots.map((_,i) => <option key={i} value={i}>{i+1}</option>)}</select></label>
        <button className="min-h-11 px-3 text-sm underline" disabled={blocked || active || state.armySlots.some((key,i) => i !== destination && key !== null && state.units[key].unitId === selected)} onClick={() => {const slots=[...state.armySlots] as ArmySlots; slots[destination]=id; void run({type:'army',slots});}}>Equip {unit.name}</button>
        <div className="mt-3 flex flex-wrap gap-3"><button className="min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:opacity-40" disabled={blocked || !spareDonors(state,id).length} onClick={() => prepare(spareDonors(state,id))}>Merge spare recruits</button><button className="min-h-11 text-sm underline" onClick={() => {setAdvanced(!advanced);setIntent(null);}}>Choose donors / transfer veteran</button></div>
        <p className="mt-2 text-xs text-slate-300">Spare selection uses fresh, unlocked, unequipped copies from this building at tier {unit.tier} or below. Nothing is consumed until you confirm.</p>
        {advanced && <fieldset className="mt-4"><legend className="font-bold">Choose exact donors</legend><p className="text-xs">Veterans transfer all invested XP plus their innate value. Unlock locked copies before selecting them.</p><div className="mt-2 max-h-64 overflow-auto">{family.map(([key,r]) => {
          const equipped=state.armySlots.includes(key);
          return <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={r.locked || blocked || (equipped && state.armySlots.includes(id))} checked={donors.includes(key)} onChange={e => {setIntent(null); setDonors(e.target.checked ? [...donors,key] : donors.filter(d => d!==key)); if(equipped) setReplace(e.target.checked ? key : undefined);}}/>{unitDefinition(r.unitId).name} · Level {recruitLevel(r)} · {r.investedXP} invested XP · {key.slice(-8)}{r.locked ? ' · Locked' : ''}{equipped ? ` · Replace in slot ${state.armySlots.indexOf(key)+1}` : ''}</label>;
        })}</div><button className="min-h-11 text-sm underline" disabled={blocked || !donors.length} onClick={() => prepare(donors,replace)}>Preview selected merge</button></fieldset>}
        {intent && <div className="mt-4 rounded-xl border border-amber-300 p-4" aria-label="Merge preview">
          {stale ? <p role="alert">{stale}</p> : preview && afterStats && <><h4 className="font-bold">{intent.replace ? `Merge and replace army slot ${state.armySlots.indexOf(intent.replace)+1}` : 'Merge preview'}</h4><p>{Object.entries(preview.counts).map(([type,count]) => `${count} ${unitDefinition(type as UnitId).name}`).join(' + ')} → {unit.name}</p><p>+{preview.gainedXP} XP · Level {preview.beforeLevel} → {preview.level} · {preview.current}/{preview.required} XP to next level</p><p>{stats!.hp} → {afterStats.hp} HP · {Number((unitDamagePerSecond(stats!)*battleSpeed(CURRENT_RULES)).toFixed(2))} → {Number((unitDamagePerSecond(afterStats)*battleSpeed(CURRENT_RULES)).toFixed(2))} damage/sec{afterStats.healBudget ? ` · healing budget ${stats!.healBudget} → ${afterStats.healBudget}` : ''}</p></>}
          <button className="mt-3 min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-amber-950 disabled:opacity-40" disabled={blocked || !!stale} onClick={async () => {if(await run({type:'merge',...intent})) {setIntent(null);setDonors([]);setReplace(undefined);}}}>{intent.replace ? 'Merge and replace' : 'Merge'}</button><button className="ml-3 min-h-11 text-sm underline" onClick={() => setIntent(null)}>Cancel</button>
        </div>}
      </>}
      {error && <p role="alert" className="mt-3 text-rose-200">{error}</p>}
      {result?.type === 'merge' && <div role="status" key={result.requestId} className="recruit-level mt-4 rounded-xl p-3"><div aria-hidden="true" className="flex">{Object.keys(result.donorCounts).map(type => <div className="merge-donor" key={type}><UnitPortrait id={type as UnitId} size={32}/></div>)}<UnitPortrait id={result.unitId} size={48}/></div><strong>+{result.gainedXP} XP · Level {result.beforeLevel} → {result.level}{result.level>result.beforeLevel ? ` · +${result.level-result.beforeLevel} ${result.level-result.beforeLevel===1?'level':'levels'}` : ''}</strong></div>}
    </div>
  </section>;
}
