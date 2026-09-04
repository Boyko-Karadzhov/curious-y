import React from 'react';
import { ArrowUp, BookOpenCheck, Clock3, LockKeyhole, ShieldCheck, Sparkles, Swords } from 'lucide-react';
import {
  canUpgradeCastle,
  CASTLE_UPGRADE_COST,
  GameState,
} from '../../game/economy';

interface KingdomPanelProps {
  state: GameState;
  onUpgrade: () => void;
  onLearn: () => void;
}

export const KingdomPanel: React.FC<KingdomPanelProps> = ({ state, onUpgrade, onLearn }) => {
  const upgradeReady = canUpgradeCastle(state);

  return (
    <section className="kingdom-panel overflow-hidden rounded-[28px] border border-amber-100/20 bg-[#102235] shadow-2xl shadow-black/30">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-gradient-to-r from-[#152b42] via-[#102235] to-[#18273a] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-300 shadow-inner">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Your Kingdom</p>
              <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-200">Peacewatch</span>
            </div>
            <h2 className="font-display text-xl font-black tracking-tight text-white">The Keep of Curiosity</h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-32">
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-300">
              <span>Keep {state.castleLevel}</span>
              <span>{state.castleXp}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-black/20 bg-black/30">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-all duration-500" style={{ width: `${state.castleXp}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={upgradeReady ? onUpgrade : onLearn}
            className={`group inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black transition-all active:scale-95 ${
              upgradeReady
                ? 'border-amber-300/60 bg-amber-300 text-[#33220a] shadow-lg shadow-amber-400/20 hover:bg-amber-200'
                : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
            }`}
          >
            {upgradeReady ? <ArrowUp className="h-4 w-4" /> : <BookOpenCheck className="h-4 w-4 text-sky-300" />}
            <span>{upgradeReady ? 'Upgrade keep' : 'Earn materials'}</span>
          </button>
        </div>
      </div>

      <div className="battlefield relative h-[245px] overflow-hidden sm:h-[285px]">
        <div className="battle-sky absolute inset-x-0 top-0 h-[58%]" />
        <div className="battle-cloud battle-cloud-one" />
        <div className="battle-cloud battle-cloud-two" />
        <div className="battle-hills absolute inset-x-0 bottom-[31%] h-[44%]" />
        <div className="battle-ground absolute inset-x-0 bottom-0 h-[40%]" />
        <div className="battle-path absolute inset-x-0 bottom-[6%] h-[25%]" />

        <img className="pixel-art absolute -left-6 bottom-8 z-10 w-[170px] drop-shadow-2xl sm:left-3 sm:w-[210px]" src="/assets/tiny-swords/castle-blue.png" alt="Your blue castle" />
        <img className="pixel-art absolute -right-6 bottom-8 z-10 w-[170px] drop-shadow-2xl sm:right-3 sm:w-[210px]" src="/assets/tiny-swords/castle-red.png" alt="Rival red castle" />
        <div className="tiny-sprite tiny-warrior tiny-warrior-blue battle-unit battle-unit-blue-one" aria-label="Blue warrior" />
        <div className="tiny-sprite tiny-archer tiny-archer-blue battle-unit battle-unit-blue-two" aria-label="Blue archer" />
        <div className="tiny-sprite tiny-warrior tiny-warrior-red battle-unit battle-unit-red-one" aria-label="Red warrior" />
        <div className="tiny-sprite tiny-archer tiny-archer-red battle-unit battle-unit-red-two" aria-label="Red archer" />

        <img className="pixel-art absolute bottom-16 left-[18%] z-[2] hidden w-24 opacity-90 sm:block" src="/assets/tiny-swords/tree.png" alt="" />
        <img className="pixel-art absolute bottom-12 right-[22%] z-[2] hidden w-16 opacity-80 sm:block" src="/assets/tiny-swords/rock.png" alt="" />

        <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-[#0a1624]/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white shadow-xl backdrop-blur-md">
          <Swords className="h-3.5 w-3.5 text-amber-300" />
          <span>Border skirmish</span>
          <span className="text-slate-400">·</span>
          <Clock3 className="h-3 w-3 text-sky-300" />
          <span>00:43</span>
        </div>

        <div className="absolute inset-x-4 bottom-3 z-20 sm:inset-x-10">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] text-white drop-shadow-md">
            <span className="text-sky-100">The Archivists</span>
            <span className="rounded-full bg-[#0a1624]/75 px-2 py-0.5 text-amber-200">Frontline {Math.round(state.warPressure)}%</span>
            <span className="text-rose-100">The Ember Court</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full border-2 border-[#102235] bg-rose-500 shadow-lg">
            <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-700" style={{ width: `${state.warPressure}%` }} />
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_white]" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-white/10 bg-[#0d1c2b] p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${upgradeReady ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}>
            {upgradeReady ? <Sparkles className="h-4 w-4 text-amber-300" /> : <LockKeyhole className="h-4 w-4 text-slate-400" />}
            {upgradeReady && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-rose-400" />}
          </div>
          <div>
            <p className="font-bold text-white">{upgradeReady ? 'Keep upgrade ready' : 'Next: reinforced walls'}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">Knowledge strengthens the kingdom. Learning is never energy-gated.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
          <span className={`rounded-lg border px-2 py-1 ${state.knowledge.force >= CASTLE_UPGRADE_COST.force ? 'border-sky-400/30 bg-sky-400/10 text-sky-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>⚙ {state.knowledge.force}/{CASTLE_UPGRADE_COST.force}</span>
          <span className={`rounded-lg border px-2 py-1 ${state.knowledge.runes >= CASTLE_UPGRADE_COST.runes ? 'border-violet-400/30 bg-violet-400/10 text-violet-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>◆ {state.knowledge.runes}/{CASTLE_UPGRADE_COST.runes}</span>
          <span className={`rounded-lg border px-2 py-1 ${state.gold >= CASTLE_UPGRADE_COST.gold ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-white/5 text-slate-400'}`}>● {state.gold}/{CASTLE_UPGRADE_COST.gold}</span>
        </div>
      </div>
    </section>
  );
};
