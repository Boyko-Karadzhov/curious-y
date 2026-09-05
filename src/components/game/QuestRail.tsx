import React from 'react';
import { CalendarCheck2, Check, ChevronRight, Crown, Flame, Gift, Swords } from 'lucide-react';
import { canClaimDaily, GameState } from '../../game/economy';

interface QuestRailProps {
  state: GameState;
  onClaimDaily: () => void;
  onLearn: () => void;
}

export const QuestRail: React.FC<QuestRailProps> = ({ state, onClaimDaily, onLearn }) => {
  const claimReady = canClaimDaily(state);
  const progress = Math.min(100, (state.answersToday / 5) * 100);

  return (
    <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
      <section className="game-rail-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-[0.17em] text-white">Daily orders</h3>
          </div>
          <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-300">11h 42m</span>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white">Feed the library</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">Answer 5 meaningful questions</p>
            </div>
            <span className="text-xs font-black text-amber-300">{Math.min(state.answersToday, 5)}/5</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-amber-200">
            <Gift className="h-3 w-3" />
            <span>250 gold + 1 Archive Key</span>
          </div>
        </div>

        <button
          type="button"
          disabled={state.dailyClaimed}
          onClick={claimReady ? onClaimDaily : onLearn}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black transition-all ${
            state.dailyClaimed
              ? 'cursor-default border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
              : claimReady
                ? 'border-amber-300 bg-amber-300 text-[#33220a] shadow-lg shadow-amber-400/10 hover:bg-amber-200'
                : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
          }`}
        >
          {state.dailyClaimed ? <Check className="h-4 w-4" /> : claimReady ? <Gift className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span>{state.dailyClaimed ? 'Reward claimed' : claimReady ? 'Claim reward' : 'Continue learning'}</span>
        </button>
      </section>

      <section className="game-rail-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-sky-300" />
            <h3 className="text-xs font-black uppercase tracking-[0.17em] text-white">Ranked arena</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400">Season 01</span>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-sky-300/15 bg-sky-300/5 p-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-300/25 bg-gradient-to-br from-slate-300/20 to-sky-400/10">
            <Crown className="h-5 w-5 text-sky-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">Silver II</p>
            <p className="text-[10px] text-slate-400">{state.trophies} trophies · 66 to promote</p>
          </div>
        </div>
      </section>

      <section className="game-rail-card flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-300/20 bg-orange-400/10">
          <Flame className="h-5 w-5 text-orange-300" />
        </div>
        <div>
          <p className="text-lg font-black leading-none text-white">{state.streak} day streak</p>
          <p className="mt-1 text-[10px] text-slate-400">+2% knowledge yield is active</p>
        </div>
      </section>
    </aside>
  );
};
