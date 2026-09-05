import { CSSProperties } from 'react';
import { LockKeyhole, Swords } from 'lucide-react';
import { Action, ARMY_LIMIT, Battle, BUILDINGS, BuildingId, Kingdom, battleGoldReward, stageLabel } from '../../lib/kingdom/game';

interface Props {
  state: Kingdom;
  battle: Battle;
  active: boolean;
  blocked: boolean;
  unavailable: boolean;
  perform: (action: Action) => Promise<boolean>;
  onLearn: () => void;
}

export function BattleHud({ state, battle, active, blocked, unavailable, perform, onLearn }: Props) {
  const allies = battle.fighters.filter(f => f.side === 'player');
  const hasArmy = BUILDINGS.some(spec => state.buildings[spec.id] > 0);
  const nextStage = state.cleared + 1;
  const result = state.battle?.result;
  const actionLabel = !state.battle ? 'Start battle' : result === 'victory' ? 'Next battle' : 'Retry';
  const title = result === 'victory' ? 'Victory!' : result === 'defeat' ? 'Defeat' : result === 'draw' ? 'Draw' : 'Ready for battle?';

  return <>
    <div className="battle-health absolute inset-x-3 top-3 z-10 grid grid-cols-2 gap-3 sm:gap-20">
      <Health label="Your Castle" hp={battle.playerHp} max={battle.playerMaxHp} />
      <Health label="Enemy Castle" hp={battle.enemyHp} max={battle.enemyMaxHp} enemy />
    </div>
    <div className="battle-stage absolute inset-x-3 top-[76px] z-10 flex items-center justify-between gap-2 text-xs font-bold text-white">
      <span className="rounded-lg bg-slate-950/80 px-3 py-1.5">Stage {stageLabel(battle.stage)} · {Math.max(0, 120 - Math.ceil(battle.elapsed))}s left</span>
      {active && <button type="button" className="min-h-11 rounded-lg bg-slate-950/80 px-3 py-1.5 text-rose-200 hover:bg-rose-950 disabled:opacity-50" disabled={blocked} onClick={() => void perform({ type: 'retreat' })}>Retreat</button>}
    </div>

    <div className="battle-spawns absolute inset-x-0 bottom-0 z-10 flex h-20 items-center justify-center gap-2 bg-gradient-to-t from-slate-950/95 to-slate-950/65 px-2 sm:gap-4" role="group" aria-label="Unit spawns">
      {BUILDINGS.map(spec => {
        const unlocked = state.buildings[spec.id] > 0;
        const count = allies.filter(f => f.kind === spec.id).length;
        const remaining = Math.max(0, battle.nextSpawn[spec.id] - battle.elapsed);
        const progress = unlocked && state.battle ? Math.max(0, Math.min(1, 1 - remaining / spec.spawnInterval)) : 0;
        const description = !unlocked ? `Build ${spec.name}` : `${count} on field · every ${spec.spawnInterval}s${active ? remaining === 0 ? ' · waiting for space' : ` · next in ${remaining.toFixed(1)}s` : ''}`;
        return <div key={spec.id} className={`relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-full ${unlocked ? 'bg-slate-900 text-sky-100' : 'bg-slate-900/60 text-slate-500'}`} role="group" aria-label={`${spec.unit}: ${description}`} title={`${spec.unit}: ${description}`}>
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 56 56" role="progressbar" aria-label={`${spec.unit} spawn progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={!unlocked ? 'Locked' : !active ? 'Battle idle' : remaining === 0 ? 'Ready; waiting for space' : `${remaining.toFixed(1)} seconds until spawn`}>
            <circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
            <circle key={`${battle.elapsed}-${battle.nextSpawn[spec.id]}-${active && !unavailable}`} className={active && !unavailable && unlocked ? 'battle-spawn-ring' : ''} cx="28" cy="28" r="25" pathLength="100" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="100" strokeDashoffset={100 - progress * 100} style={{ '--spawn-duration': `${spec.spawnInterval}s`, '--spawn-delay': `${-progress * spec.spawnInterval}s` } as CSSProperties} />
          </svg>
          <div className="absolute inset-1 flex flex-col items-center justify-center" aria-hidden="true">
            <UnitIcon kind={spec.id} /><span className="text-sm font-black leading-4 tabular-nums">{count}</span>
          </div>
          {!unlocked && <LockKeyhole aria-hidden="true" className="absolute -right-0.5 top-0 h-3.5 w-3.5 rounded-full bg-slate-900 p-0.5" />}
        </div>;
      })}
      <span className="ml-1 text-xs font-bold tabular-nums text-slate-200" title="Army capacity">{allies.length}/{ARMY_LIMIT}</span>
    </div>

    {unavailable && active && <p role="status" className="absolute inset-x-3 top-28 z-20 mx-auto w-fit rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">Reconnecting…</p>}
    {!active && <div className="battle-result absolute inset-x-0 bottom-20 top-28 z-20 flex items-center justify-center px-4">
      <div role="dialog" aria-label={title} className="max-h-full w-full max-w-xs overflow-y-auto rounded-2xl border border-white/20 bg-slate-950/95 p-4 text-center text-white shadow-2xl sm:p-5">
        <h2 className={`text-2xl font-black ${result === 'victory' ? 'text-amber-300' : 'text-white'}`}>{title}</h2>
        <p className="mt-1 text-xs text-slate-300">{result === 'victory' ? `Stage ${stageLabel(battle.stage)} cleared · Next: ${stageLabel(nextStage)}` : `Stage ${stageLabel(nextStage)}${result ? ' · Strengthen your army and try again' : ''}`}</p>
        <p className="mt-2 text-sm font-bold text-amber-300">{result === 'victory' ? `+${battleGoldReward(battle.stage)} Gold earned` : `Victory reward: ${battleGoldReward(nextStage)} Gold`}</p>
        {!hasArmy && <p className="mt-2 text-xs text-amber-200">Build the Barracks below to field your first unit.</p>}
        <button type="button" className="mt-3 w-full rounded-xl bg-amber-300 px-5 py-3 text-lg font-black text-amber-950 shadow-lg hover:bg-amber-200 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed" disabled={blocked || !hasArmy} onClick={() => void perform({ type: 'start', stage: nextStage })}>{actionLabel}</button>
        {!!result && result !== 'victory' && <button type="button" className="mt-2 text-xs font-bold text-slate-300 underline underline-offset-4 hover:text-white" onClick={onLearn}>Answer another question</button>}
      </div>
    </div>}
  </>;
}

function Health({ label, hp, max, enemy = false }: { label: string; hp: number; max: number; enemy?: boolean }) {
  return <div className="min-w-0 rounded-xl bg-slate-950/80 p-2.5 text-white">
    <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 text-[10px] font-bold sm:text-xs"><span>{label}</span><span className="tabular-nums">{Math.ceil(hp)}/{max}</span></div>
    <div role="progressbar" aria-label={label} aria-valuenow={Math.ceil(hp)} aria-valuemin={0} aria-valuemax={max} className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className={`h-full ${enemy ? 'bg-rose-400' : 'bg-sky-400'}`} style={{ width: `${hp / max * 100}%` }} /></div>
  </div>;
}

function UnitIcon({ kind }: { kind: BuildingId }) {
  if (kind === 'barracks') return <Swords className="h-5 w-5" />;
  if (kind === 'stable') return <span className="h-5 text-2xl leading-5">♞</span>;
  if (kind === 'range') return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3c17 0 17 18 0 18l7-9-7-9M4 12h17m-4-4 4 4-4 4" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17h16M8 17l4-10 4 10M12 10l7-7M17 3h5v4h-3" /><circle cx="6" cy="20" r="2" /><circle cx="18" cy="20" r="2" /></svg>;
}
