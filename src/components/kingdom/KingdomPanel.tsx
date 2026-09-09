import { AvailableActionIndicator } from './AvailableActionIndicator';
import { availableCastleAction } from '../../lib/kingdom/availability';
import { RecruitmentPanel } from './RecruitmentPanel';
import { ForgePanel } from './ForgePanel';
import { isRecruitingBuilding } from '../../lib/kingdom/game';
import { KnowledgeTowers } from './KnowledgeTowers';
import { TopicName } from '../../lib/kingdom/game';
import React, { useRef, useState } from 'react';
import { BookOpen, Castle, Flag, Shield, Sparkles } from 'lucide-react';
import { DOCTRINES, dailyTribute, utcDay, Action, UNITS, BUILDINGS, BUILDING_DEFINITIONS, LIBRARY_MILESTONES, effectDescription, unitDamagePerSecond, keepAppearance, Kingdom, MAX_LEVEL, formatCost, castleHp, unitStats, upgradeStatus } from '../../lib/kingdom/game';
import { ProgressionGoal } from '../../lib/kingdom/goals';
import { libraryPath, type LearningShortcut } from '../../lib/kingdom/learningPath';
import { KeepVisual } from './KeepVisual';
import { BuildingVisual, CastleMap, CastleSelection } from './CastleMap';

interface Props {
  state: Kingdom;
  act: (action: Action) => Promise<boolean>;
  unavailable: boolean;
  serverBacked?: boolean;
  onLearn: (shortcut?: LearningShortcut) => void;
  onLearnTopic?: (topic: TopicName, shortcut?: LearningShortcut) => void;
  learningBlocked?: string | null;
  pendingReward?: boolean;
  onPrepareArmy?: (slot: number) => void;
  goalCard?: React.ReactNode;
  onSelectGoal?: (goal: ProgressionGoal) => void;
}
const button = 'min-h-11 w-full rounded-xl px-4 py-3 text-sm font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors';

export const KingdomPanel: React.FC<Props> = ({ state, act, unavailable, serverBacked = false, onLearn, onPrepareArmy, goalCard, onSelectGoal, onLearnTopic, learningBlocked, pendingReward }) => {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CastleSelection>('castle');
  const [notice, setNotice] = useState('');
  const [goalExpanded, setGoalExpanded] = useState(false);
  const pending = useRef(false);
  const details = useRef<HTMLElement>(null);
  const active = !!state.battle && !state.battle.result;
  const blocked = busy || unavailable;
  const spec = BUILDING_DEFINITIONS.find(b => b.id === selected);
  const military = BUILDINGS.find(b => b.id === selected);
  const level = spec ? state.buildings[spec.id] : state.castle;
  const cap = spec?.cap ?? MAX_LEVEL;
  const name = spec?.name ?? 'Your Keep';
  const action = spec ? { type: 'building' as const, id: spec.id } : { type: 'castle' as const };
  const status = upgradeStatus(state, action);
  const availableAction = !blocked ? availableCastleAction(state, selected) : null;
  const purchasable = !spec || spec.mode === 'purchase' && ((!military && spec.id !== 'forge') || level === 0);
  const stats = military ? unitStats(military.unitId, Math.max(1, level)) : null;
  const milestone = LIBRARY_MILESTONES.find(n => n > state.libraryConcepts);
  const learnForUpgrade = () => {
    const topic = (Object.keys(status.missing.resources) as TopicName[]).find(t => (status.missing.resources[t] ?? 0) > 0);
    const shortcut: LearningShortcut = { kind: 'goal', goal: spec ? { type: 'building', id: spec.id, level: level + 1 } : { type: 'castle', level: level + 1 } };
    if (topic && onLearnTopic) onLearnTopic(topic, shortcut); else onLearn(shortcut);
  };
  const select = (id: CastleSelection) => { setSelected(id); setNotice(''); };
  const perform = async () => {
    if (pending.current || blocked || !status.ready) return;
    pending.current = true; setBusy(true); setNotice('');
    try {
      const success = await act(action);
      setNotice(success ? `${spec?.name ?? 'Keep'} ${level ? 'upgraded' : 'built'} to level ${level + 1}.` : 'Could not save this upgrade. Please try again.');
    } catch {
      setNotice('Could not save this upgrade. Please try again.');
    } finally { pending.current = false; setBusy(false); }
  };

  return <div className="space-y-5" aria-label="Castle management">
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div><p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-amber-300">Built from what you learn</p><h2 className="mt-1 flex items-center gap-2 text-xl font-extrabold text-white"><Castle className="h-5 w-5 text-amber-200" /> Your Castle <span className="text-sm font-medium text-slate-400">· Level {state.castle}</span></h2></div>
        <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-300"><span className="inline-flex items-center gap-1.5"><Shield size={14} /> {castleHp(state.castle)} HP</span><span className="inline-flex items-center gap-1.5"><Flag size={14} /> {state.cleared} territories</span><span className="text-amber-200">{state.gold} Gold</span></div>
      </header>
      <div className="border-t border-white/10 px-5 py-4 text-sm text-amber-100" aria-label="Territory tribute">
        <p className="font-bold">{state.cleared} territories · {dailyTribute(state.cleared, state.buildings.treasury)} Gold daily · {state.lifetimeGold} lifetime Gold</p>
        <p className="mt-1">{state.tribute.day === utcDay() && state.tribute.claimed ? `Today's tribute collected: ${state.tribute.paid} Gold.` : state.cleared ? 'Answer one question correctly today to collect tribute automatically.' : 'Win your first battle to establish daily tribute.'}</p>
        <p className="mt-1 text-xs text-slate-400">Resets at 00:00 UTC. Missed days do not accumulate. Additional territories increase the next day's tribute.</p>
      </div>
      <div className="grid items-stretch xl:grid-cols-[minmax(0,1fr)_320px]">
        <CastleMap unavailable={unavailable} state={state} selected={selected} onSelect={select} onInspect={() => details.current?.focus({ preventScroll: false })} />
        <section id="castle-building-details" ref={details} tabIndex={-1} aria-label={`${name} details`} className="bg-[#f7f6ee] p-5 text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 sm:p-6">
          <button type="button" className="mb-3 min-h-11 text-xs font-bold text-slate-600 xl:hidden" onClick={() => { const plot = document.getElementById(selected === 'castle' ? 'kingdom-castle' : `kingdom-building-${selected}`); plot?.focus({ preventScroll: true }); plot?.scrollIntoView({ block: 'center', behavior: 'auto' }); }}>← Back to Castle map</button>
          <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{spec?.branch ?? 'Heart of your Castle'}</p><span className="rounded-full bg-slate-200/70 px-2 py-1 text-[10px] font-bold">{spec?.mode === 'future' ? 'Coming soon' : level ? `Level ${level} / ${cap}` : 'Not built'}</span></div>
          <h3 className="mb-4 mt-2 text-2xl font-extrabold">{name}</h3>
          <div className="castle-detail-art">{spec ? <BuildingVisual id={spec.id} /> : <KeepVisual level={state.castle} />}</div>
          {!spec ? <><p className="font-bold">{keepAppearance(level)} · {castleHp(level)} castle HP</p><p className="mt-2 text-sm text-slate-600">Your Keep unlocks construction. The Recruitment Hall levels through recruitment. Gold funds permanent kingdom upgrades.</p>{level < cap && <p className="mt-3 text-sm text-emerald-800">Next: +{castleHp(level + 1) - castleHp(level)} castle HP ({castleHp(level + 1)} total){BUILDING_DEFINITIONS.some(b => b.unlock === level + 1) && ` · unlocks ${BUILDING_DEFINITIONS.filter(b => b.unlock === level + 1).map(b => b.name).join(', ')}`}</p>}</> : <>
            {military && stats && level === 0 && <><p className="text-sm font-bold">{military.unit} · Spawns every {stats.spawnInterval}s</p><p className="mt-1 text-xs text-slate-500">{UNITS.find(u => u.id === military.unitId)!.role}</p><p className="mt-3 text-sm">{stats.hp} HP · {unitDamagePerSecond(stats)} damage/sec</p></>}
            {!military && <p className="mt-3 text-sm text-slate-700">Current: {effectDescription(spec.id, level)}</p>}
            {!military && spec.id !== 'forge' && level < cap && <p className="mt-2 text-sm text-emerald-800">Next: {effectDescription(spec.id, level + 1)}</p>}

            {spec.mode === 'knowledge' && <><p className="mt-3 text-sm">{state.libraryConcepts} distinct qualifying concepts · {milestone ? `Next knowledge milestone: ${milestone}` : 'All knowledge milestones reached'}</p><progress aria-label="Library knowledge milestone" className="mt-3 h-2 w-full accent-emerald-600" value={Math.min(state.libraryConcepts, milestone ?? 150)} max={milestone ?? 150} /><p className="mt-2 text-xs text-slate-500">Earn levels at 10, 30, 75 and 150 qualifying concepts. Currency cannot buy progress.</p><details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer py-2">What counts toward the Library?</summary>Proficient or mastered concepts with earned reasoning progress count once across aliases. Atomic foundations are excluded. {serverBacked ? 'Verified from your protected account mastery.' : 'Demo learning only; never imported into signed-in accounts.'}</details><button type="button" className={`${button} mt-4`} onClick={() => onLearn(libraryPath(state))}>Learn toward the Library</button></>}
            {spec.mode === 'future' && <p className="mt-3 text-sm text-slate-500">Planned at Keep {spec.unlock}. Equipment and crafting are in development; this building cannot be constructed yet.</p>}
            {spec.id === 'treasury' && <p className="mt-3 text-xs text-slate-500">Adds 2% daily tribute per level, up to 10%. Tribute is available from your first territory, even without a Treasury.</p>}
          </>}
          {spec && isRecruitingBuilding(spec.id) && level > 0 && <RecruitmentPanel key={spec.id} state={state} id={spec.id} blocked={blocked} perform={act} onLearn={topic => onLearnTopic ? onLearnTopic(topic, { kind: 'goal', goal: { type: 'recruit', id: spec.id as typeof BUILDINGS[number]['id'], count: state.recruitCount[spec.id as typeof BUILDINGS[number]['id']] + 1 } }) : onLearn()} />}
          {spec?.id === 'academy' && level > 0 && <div className="mt-4 space-y-2" aria-label="Battle doctrines">{DOCTRINES.map(d => <button key={d.id} type="button" aria-pressed={state.doctrine === d.id} disabled={blocked || active || level < d.level} onClick={() => void act({ type: 'doctrine', id: d.id })} className="block w-full rounded-lg border border-slate-400 p-3 text-left text-sm aria-pressed:bg-sky-100 disabled:opacity-40"><strong>{d.name}</strong><p>{d.description}</p>{level < d.level && <small>Academy level {d.level}</small>}</button>)}</div>}
          {spec?.id === 'forge'  && level > 0 && <a href="#forge-workshop" className={`${button} mt-4 block text-center`}>{state.forge.pending ? 'Review forged item ↓' : 'Open Forge workshop ↓'}</a>}
          {spec && isRecruitingBuilding(spec.id) && level > 0 && onSelectGoal && <button type="button" className="min-h-11 text-sm underline" onClick={()=>{if(isRecruitingBuilding(spec.id)){setGoalExpanded(true);onSelectGoal({type:'recruit',id:spec.id,count:state.recruitCount[spec.id]+1});}}}>Set recruitment goal</button>}
          {purchasable && <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
            {level < cap && <div className="text-sm"><p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{level ? 'Upgrade cost' : 'Construction cost'}</p><p className="mt-1 font-bold">{formatCost(status.cost)}</p></div>}
            <button type="button" className={`${button} flex items-center justify-center gap-2`} aria-description={availableAction ?? undefined} disabled={blocked || !status.ready} onClick={() => void perform()}>{availableAction && <AvailableActionIndicator label={availableAction} />}{busy ? 'Saving…' : level >= cap ? `${spec?.name ?? 'Castle'} at max level` : `${level ? 'Upgrade' : 'Build'} ${spec?.name ?? 'Castle'} · ${formatCost(status.cost)}`}</button>
            {unavailable ? <p className="text-xs text-rose-700">Reload Castle to check availability and make upgrades.</p> : status.blocker && level < cap ? <p className="text-xs text-slate-600">{status.blocker}</p> : null}
            {!status.affordable && level < cap && <p className="text-xs text-slate-600">Need {formatCost(status.missing)} more.</p>}
            {onSelectGoal && level < cap && <button type="button" disabled={blocked} onClick={() => { setGoalExpanded(true); onSelectGoal(spec ? { type: 'building', id: spec.id, level: level + 1 } : { type: 'castle', level: level + 1 }); }} className="min-h-11 text-sm font-bold text-brand-700 underline disabled:opacity-50">{spec ? `Set ${spec.name} goal` : 'Set Castle upgrade goal'}</button>}
          </div>}
          {military && onPrepareArmy && !!level && state.armySlots.includes(null) && Object.values(state.units).some(r => r.unitId === military.unitId) && <button type="button" disabled={blocked || active} onClick={() => onPrepareArmy(state.armySlots.indexOf(null))} className="mt-3 min-h-11 text-sm font-bold text-brand-700 underline disabled:opacity-50">{UNITS.find(u => u.id === military.unitId)!.name} available · Go to empty square {state.armySlots.indexOf(null) + 1}</button>}
          <p role="status" className="mt-3 text-sm text-brand-800">{notice}</p>
          {spec?.mode !== 'knowledge' && <button type="button" disabled={blocked || !!learningBlocked} onClick={learnForUpgrade} className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-slate-600 hover:text-brand-700"><BookOpen size={15} /> Earn more by learning</button>}
        </section>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[11px] text-slate-400"><span>{BUILDING_DEFINITIONS.filter(b => state.buildings[b.id] > 0).length} / {BUILDING_DEFINITIONS.filter(b => b.mode !== 'future').length} buildings constructed</span><span className="inline-flex items-center gap-1.5"><Sparkles size={13} className="text-amber-300" /> Gold markers show available builds, recruitment and forging</span></footer>
    </section>
    {state.buildings.forge > 0 && <div id="forge-workshop"><ForgePanel state={state} perform={act} blocked={blocked} onLearn={topic=>onLearnTopic ? onLearnTopic(topic, { kind: 'forge', count: state.forge.count + 1 }) : onLearn()}/></div>}
    <KnowledgeTowers state={state} onLearnTopic={onLearnTopic} learningBlocked={unavailable ? "Reload Castle to view verified progress." : learningBlocked} pendingReward={pendingReward} />
    {goalCard && <details open={goalExpanded} onToggle={event => setGoalExpanded(event.currentTarget.open)} className="rounded-2xl border border-white/10 bg-slate-900 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-200">Your learning & upgrade goal</summary><div className="mt-4">{goalCard}</div></details>}
    <p className="text-center text-xs text-slate-500">{serverBacked ? 'Your Castle and campaign save securely to your account.' : 'Explorer Demo · Progress saves to this browser.'}</p>
  </div>;
};
