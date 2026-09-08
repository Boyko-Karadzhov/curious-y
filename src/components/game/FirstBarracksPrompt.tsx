import { ArrowRight } from 'lucide-react';
import { Kingdom, UpgradeAction } from '../../lib/kingdom/game';
import { goalProgress, initialGoal } from '../../lib/kingdom/goals';

interface Props {
  state: Kingdom;
  learningBlocked: string | null;
  preferenceSaving: boolean;
  pendingReward: boolean;
  onLearn: () => void;
  onNavigateUpgrade: (action: UpgradeAction) => void;
}

export function FirstBarracksPrompt({ state, learningBlocked, preferenceSaving, pendingReward, onLearn, onNavigateUpgrade }: Props) {
  const progress = goalProgress(state, initialGoal);
  const target = 10;
  const force = Math.min(5,state.tokens.Life) + Math.min(5,state.tokens['Earth & Space']);
  const blocked = progress.ready ? preferenceSaving : !!learningBlocked;

  return <>
    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Your first army starts here</p>
    <h2 className="mt-1 text-2xl font-black">Build Recruitment Hall</h2>
    <p className="mt-1 text-xs leading-relaxed text-slate-300">{progress.ready ? 'Your Recruitment Hall is funded! Build it in Castle, then recruit three copies for 8 Essence + 8 Astral Dust.' : pendingReward ? 'Collect your learning resources to make progress toward your Recruitment Hall.' : 'Learn Earth & Life → Build (5 Essence + 5 Astral Dust) → Recruit → Equip your copies → Conquer territory.'}</p>
    <div className="mt-3 text-left">
      <p className="flex justify-between gap-2 text-xs font-bold"><span>Essence {state.tokens.Life}/5 · Astral Dust {state.tokens['Earth & Space']}/5</span></p>
      <div role="progressbar" aria-label="Resources for Recruitment Hall" aria-valuemin={0} aria-valuemax={target} aria-valuenow={force} aria-valuetext={`${force} of ${target} resources collected`} className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full bg-amber-300" style={{ width: `${target ? Math.min(100, force / target * 100) : 100}%` }} />
      </div>
    </div>
    <button type="button" disabled={blocked} onClick={() => progress.ready ? onNavigateUpgrade(progress.action) : onLearn()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-2 text-sm font-extrabold text-amber-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
      {progress.ready ? 'Go to Recruitment Hall' : pendingReward ? 'Collect Resources' : 'Learn Earth & Life'}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
    </button>
    {!progress.ready && learningBlocked && <p role="status" className="mt-2 text-xs text-amber-200">{learningBlocked}</p>}
  </>;
}
