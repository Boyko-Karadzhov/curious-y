import React, { useState } from 'react';
import { Castle, Flag, Hammer, BookOpen, Shield, Swords } from 'lucide-react';
import { Action, UNITS, BUILDINGS, BUILDING_DEFINITIONS, LIBRARY_MILESTONES, effectDescription, unitDamagePerSecond, keepAppearance, Kingdom, MAX_LEVEL, buildingCost, canAfford, formatCost, missingCost, castleCost, castleHp, unitStats, upgradeStatus } from '../../lib/kingdom/game';
import { ProgressionGoal } from '../../lib/kingdom/goals';
import { KeepVisual } from './KeepVisual';

interface Props {
  state: Kingdom;
  act: (action: Action) => Promise<boolean>;
  unavailable: boolean;
  serverBacked?: boolean;
  onLearn: () => void;
  onPrepareArmy?: (slot: number) => void;
  goalCard?: React.ReactNode;
  onSelectGoal?: (goal: ProgressionGoal) => void;
}
const button = 'rounded-xl px-4 py-2 text-sm font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors';

export const KingdomPanel: React.FC<Props> = ({ state, act, unavailable, serverBacked = false, onLearn, onPrepareArmy, goalCard, onSelectGoal }) => {
  const [busy, setBusy] = useState(false);
  const battle = state.battle;
  const active = !!battle && !battle.result;
  const perform = async (action: Action) => {
    setBusy(true);
    try { return await act(action); } finally { setBusy(false); }
  };
  const blocked = busy || unavailable;
  const castleUpgrade = castleCost(state.castle);

  return (
    <div className="space-y-6" aria-label="Castle management">
      {goalCard}

      <section id="kingdom-castle" tabIndex={-1} className="scroll-mt-4 rounded-3xl bg-slate-900 text-white p-5 sm:p-8 overflow-hidden">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase text-amber-300">Built from what you learn</p>
            <h2 className="text-3xl font-extrabold mt-2 flex items-center gap-3"><Castle className="w-9 h-9" /> Your Keep · Level {state.castle}</h2>
            <p className="mt-2 text-amber-200">{keepAppearance(state.castle)} · The heart of your Castle</p>
            <p className="text-sm text-slate-300 mt-3 max-w-lg">Learn to collect Resources, win battles for Gold, and spend both on your Castle and army.</p>
          </div>
          <KeepVisual level={state.castle} />
          <div className="rounded-2xl bg-white/10 px-5 py-3"><p className="text-xs text-amber-200">Gold balance</p><p className="text-2xl font-black">{state.gold} Gold</p></div>
        </div>
        <div className="flex flex-wrap gap-3 mt-6 text-sm">
          <span className="rounded-xl bg-white/10 px-3 py-2"><Shield className="inline w-4 h-4 mr-1" /> {castleHp(state.castle)} castle HP</span>
          <span className="rounded-xl bg-white/10 px-3 py-2"><Swords className="inline w-4 h-4 mr-1" /> {BUILDINGS.filter(b => state.buildings[b.id] > 0).length}/{BUILDINGS.length} units unlocked · 4 army slots</span>
          <span className="rounded-xl bg-white/10 px-3 py-2"><Flag className="inline w-4 h-4 mr-1" /> {state.cleared} battles won</span>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className={button} disabled={blocked || !upgradeStatus(state, { type: 'castle' }).ready} onClick={() => perform({ type: 'castle' })}>
            {state.castle === MAX_LEVEL ? 'Castle at max level' : `Upgrade Castle · ${formatCost(castleUpgrade)}`}
          </button>
          <p className="text-xs text-slate-300">{active ? 'Finish or retreat from battle to upgrade.' : state.castle === MAX_LEVEL ? 'All building levels available.' : `Next: +120 castle HP, building level ${state.castle + 1}${state.castle === 1 ? ', unlock Stable' : state.castle === 2 ? ', unlock Siege Workshop' : ''}.`}</p>
        </div>
        {!active && state.castle < MAX_LEVEL && !canAfford(state, castleUpgrade) && <p className="text-xs text-amber-200 mt-3">Need {formatCost(missingCost(state, castleUpgrade))} more. Win battles for Gold and learn for Resources.</p>}
        {onSelectGoal && state.castle < MAX_LEVEL && <button type="button" disabled={blocked} onClick={() => onSelectGoal({ type: 'castle', level: state.castle + 1 })} className="mt-4 mr-4 min-h-11 text-sm font-bold text-amber-200 underline disabled:opacity-50">Set Castle upgrade goal</button>}
        <button type="button" onClick={onLearn} className="mt-4 text-sm font-bold text-amber-200 hover:text-amber-100"><BookOpen className="inline w-4 h-4 mr-1" /> Earn more by learning</button>
      </section>

      <nav aria-label="Building unlock tree" className="rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white">
        <h2 className="text-lg font-extrabold">Keep → Building progression</h2>
        <p className="mt-2 text-sm text-slate-300">Each branch upgrades from level 1 to 5, capped by your Keep. Library follows knowledge milestones. Choose a building goal to see the topics and Resources you need.</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5].map(level => <li key={level} className={`rounded-xl border p-3 ${state.castle >= level ? 'border-amber-300/50' : 'border-slate-700'}`}>
          <p className="font-bold">Keep {level} · {keepAppearance(level)} {state.castle >= level ? '✓' : '· Locked'}</p>
          <p className="text-xs text-slate-400">{castleHp(level)} HP · purchased building cap {level}</p>
          <ul className="mt-2 space-y-2">{BUILDING_DEFINITIONS.filter(b => b.unlock === level).map(b => <li key={b.id}>
            <a className="inline-block min-h-11 py-2 text-sm text-amber-200 underline focus-visible:outline" href={`#kingdom-building-${b.id}`}>{b.name}</a>
            <span className="block text-xs text-slate-300">{b.branch} · {b.mode === 'future' ? 'Planned; unavailable' : b.mode === 'knowledge' ? 'Earned by learning' : state.buildings[b.id] ? `Level ${state.buildings[b.id]}/${b.cap}` : 'Not built'}</span>
          </li>)}</ul>
        </li>)}</ol>
      </nav>

      <section className="rounded-3xl bg-white p-5 sm:p-6">
        <h2 className="font-extrabold text-lg flex items-center gap-2 mb-2"><Hammer className="w-5 h-5 text-brand-600" /> Military and support branches</h2>
        <p className="text-sm text-slate-500 mb-4">Construct a building, then equip its unit in one of four slots. Existing 30% base health/damage growth is preserved; each branch adds its own specialty. Effects freeze at battle start. Medics share spawn and field limits and cannot heal other Medics, Keeps, or fallen units. All battles end within 90 seconds.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          {BUILDINGS.map(spec => {
            const level = state.buildings[spec.id];
            const locked = state.castle < spec.unlock;
            const capped = level >= state.castle;
            const cost = buildingCost(spec.id, level);
            const stats = unitStats(spec.unitId, Math.max(1, level));
            const next = unitStats(spec.unitId, level + 1);
            return <article key={spec.id} id={`kingdom-building-${spec.id}`} tabIndex={-1} className="scroll-mt-4 rounded-2xl bg-white border border-slate-200 p-5 flex flex-col items-start">
              <div className="flex items-center gap-3"><span aria-hidden="true" className="text-3xl text-brand-700 bg-brand-50 rounded-xl w-12 h-12 flex items-center justify-center">{spec.symbol}</span><div><h3 className="font-extrabold">{spec.name}</h3><p className="text-xs text-slate-500">{locked ? `Locked · Castle level ${spec.unlock}` : level ? `Level ${level} · ${spec.unit} unlocked` : 'Not built'}</p></div></div>
              <p className="font-bold text-sm mt-4">{spec.unit} · Spawns every {stats.spawnInterval}s</p>
              <p className="text-xs text-slate-500 mt-1">{UNITS.find(u => u.id === spec.unitId)!.role}</p>
              <p className="text-sm mt-3">{stats.hp} HP · {unitDamagePerSecond(stats)} damage/sec</p>
              <p className="mt-2 text-sm text-brand-700" title={`Current: ${effectDescription(spec.id, level)}. Next: ${effectDescription(spec.id, Math.min(5, level + 1))}`}>Current: {effectDescription(spec.id, level)}</p>
              {level < MAX_LEVEL && <p className="mt-1 text-xs text-emerald-700">Next: {effectDescription(spec.id, level + 1)}</p>}
              {!!level && !capped && <p className="text-xs text-emerald-700">Upgrade → {next.hp} HP · {unitDamagePerSecond(next)} damage/sec</p>}
              <div className="mt-auto pt-4 w-full">
                <button type="button" className={`${button} w-full`} disabled={blocked || !upgradeStatus(state, { type: 'building', id: spec.id }).ready} onClick={() => perform({ type: 'building', id: spec.id })}>
                  {locked ? `Requires Castle ${spec.unlock}` : capped ? (level === MAX_LEVEL ? `${spec.name} max level` : 'Upgrade Castle first') : `${level ? 'Upgrade' : 'Build'} ${spec.name} · ${formatCost(cost)}`}
                </button>
                {onPrepareArmy && !!level && state.armySlots.includes(null) && !state.armySlots.includes(spec.unitId) && <button type="button" disabled={blocked || active} onClick={() => onPrepareArmy(state.armySlots.indexOf(null))} className="mt-2 min-h-11 text-sm font-bold text-brand-700 underline disabled:opacity-50">{spec.unit} available · Go to empty square {state.armySlots.indexOf(null) + 1}</button>}
                {onSelectGoal && level < MAX_LEVEL && <button type="button" disabled={blocked} onClick={() => onSelectGoal({ type: 'building', id: spec.id, level: level + 1 })} className="mt-2 min-h-11 text-sm font-bold text-brand-700 underline disabled:opacity-50">Set {spec.name} goal</button>}
                {!locked && !capped && !active && !canAfford(state, cost) && <p className="text-xs text-slate-500 mt-2">Need {formatCost(missingCost(state, cost))} more.</p>}
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Knowledge and economy buildings">
        {BUILDING_DEFINITIONS.filter(b => !BUILDINGS.some(m => m.id === b.id)).map(spec => {
          const level = state.buildings[spec.id];
          const status = upgradeStatus(state, { type: 'building', id: spec.id });
          const milestone = LIBRARY_MILESTONES.find(n => n > state.libraryConcepts);
          return <article key={spec.id} id={`kingdom-building-${spec.id}`} tabIndex={-1} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-extrabold">{spec.name} {spec.mode !== 'future' && `· Level ${level}/${spec.cap}`}</h2>
            <p className="text-xs text-slate-500">{spec.branch}</p>
            <p className="mt-3 text-sm" title={effectDescription(spec.id, level)}>Current: {effectDescription(spec.id, level)}</p>
            {spec.mode !== 'future' && level < spec.cap && <p className="mt-1 text-sm text-emerald-700">Next: {effectDescription(spec.id, level + 1)}</p>}
            {spec.mode === 'knowledge' ? <>
              <p className="mt-3 text-sm">{state.libraryConcepts} distinct qualifying concepts · {milestone ? `Next knowledge milestone: ${milestone}` : 'All knowledge milestones reached'}</p>
              <p className="mt-2 text-xs text-slate-500">Milestones: 10 / 30 / 75 / 150. Proficient or mastered concepts with earned reasoning progress count once across aliases. Atomic foundations are excluded. {serverBacked ? 'Verified from your protected account mastery.' : 'Demo learning only; never imported into signed-in accounts.'} Currency cannot buy progress.</p>
              <button type="button" className={`${button} mt-4`} onClick={onLearn}>Learn toward the Library</button>
            </> : spec.mode === 'future' ? <p className="mt-3 text-sm text-slate-500">[WIP: Planned at Keep {spec.unlock}. Equipment and crafting are in development; this building cannot be constructed yet.]</p> : <>
              <p className="mt-3 text-xs text-slate-500">Victory Gold only: 2% per level, maximum 10%, rounded down. Frozen at battle start and collected once. <span className="block mt-1">[WIP: Offline production is in development and is not available yet.]</span></p>
              <button type="button" className={`${button} mt-4`} disabled={blocked || !status.ready} onClick={() => perform({ type: 'building', id: spec.id })}>{status.blocker ?? `${level ? 'Upgrade' : 'Build'} ${spec.name} · ${formatCost(status.cost)}`}</button>
              {!status.affordable && <p className="mt-2 text-xs text-slate-500">Need {formatCost(status.missing)} more.</p>}
              {onSelectGoal && level < spec.cap && <button type="button" className="mt-3 block min-h-11 text-sm font-bold text-brand-700 underline" disabled={blocked} onClick={() => onSelectGoal({ type: 'building', id: spec.id, level: level + 1 })}>Set {spec.name} goal</button>}
            </>}
          </article>;
        })}
      </section>

      <p className="text-xs text-slate-500 text-center">{serverBacked ? 'Your Castle and campaign save securely to your account. Earlier browser saves are not imported.' : 'Explorer Demo · Progress saves to this browser.'}</p>
    </div>
  );
};
