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
  const target = progress.cost.resources.Physics ?? 0;
  const force = state.tokens.Physics;
  const blocked = progress.ready ? preferenceSaving : !!learningBlocked;

  return <>
    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Your first army starts here</p>
    <h2 className="mt-1 text-2xl font-black">Build Barracks</h2>
    <p className="mt-1 text-xs leading-relaxed text-slate-300">{progress.ready ? 'Your Barracks is funded! Build it in Castle, then Recruit three Militia for 15 more Force.' : pendingReward ? 'Your learning reward is waiting. Collect it to make progress toward your Barracks.' : 'Learn Physics → Collect → Build Barracks (10 Force) → Recruit (15 Force) → Equip or merge → Battle.'}</p>
    <div className="mt-3 text-left">
      <p className="flex justify-between gap-2 text-xs font-bold"><span>Force</span><span>{force} / {target}</span></p>
      <div role="progressbar" aria-label="Force for Barracks" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(force, target)} aria-valuetext={`${force} of ${target} Force collected`} className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full bg-amber-300" style={{ width: `${target ? Math.min(100, force / target * 100) : 100}%` }} />
      </div>
    </div>
    <button type="button" disabled={blocked} onClick={() => progress.ready ? onNavigateUpgrade(progress.action) : onLearn()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-3 py-2 text-sm font-extrabold text-amber-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">
      {progress.ready ? 'Go to Barracks' : pendingReward ? 'Collect Resources' : 'Learn Physics for Force'}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
    </button>
    {!progress.ready && learningBlocked && <p role="status" className="mt-2 text-xs text-amber-200">{learningBlocked}</p>}
  </>;
}
