import { useEffect, useRef, useState } from 'react';
import { BUILDINGS, Kingdom, UpgradeAction, formatCost, stageLabel } from '../../lib/kingdom/game';
import { goalOptions, goalProgress, goalTitle, ProgressionGoal } from '../../lib/kingdom/goals';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';
import { TopicName } from '../../types';

export interface ProgressionGoalProps {
  state: Kingdom;
  goal: ProgressionGoal | null;
  onSelect: (goal: ProgressionGoal | null) => void;
  unavailable: boolean;
  preferenceError?: string | null;
  preferenceLoaded?: boolean;
  preferenceSaving?: boolean;
  onRetryPreference?: () => void;
  learningBlocked?: string | null;
  pendingReward?: boolean;
  onLearnTopic: (topic: TopicName) => void;
  onBattle: () => void;
  onPurchase: (action: UpgradeAction) => Promise<boolean>;
}
const button = 'min-h-11 rounded-xl px-3 py-2 text-sm font-bold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed';

export function ProgressionGoalCard({ state, goal, onSelect, unavailable, preferenceError, preferenceLoaded = true, preferenceSaving = false, onRetryPreference, learningBlocked, pendingReward, onLearnTopic, onBattle, onPurchase }: ProgressionGoalProps) {
  const [busy, setBusy] = useState(false);
  const purchasing = useRef(false);
  const purchaseTarget = useRef<string | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const options = goalOptions(state);
  const progress = goal ? goalProgress(state, goal) : null;
  useEffect(() => {
    if (progress?.complete && purchaseTarget.current === JSON.stringify(goal)) {
      purchaseTarget.current = null;
      status.current?.focus({ preventScroll: true });
    }
  }, [goal, progress?.complete]);
  const active = !!state.battle && !state.battle.result;
  const hasArmy = BUILDINGS.some(b => state.buildings[b.id] > 0);
  const select = (next: ProgressionGoal | null) => { purchaseTarget.current = null; setPurchaseError(null); onSelect(next); };
  const buy = async () => {
    if (!progress?.ready || progress.complete || progress.invalid || unavailable || preferenceSaving || purchasing.current) return;
    purchasing.current = true; setBusy(true); setPurchaseError(null);
    purchaseTarget.current = JSON.stringify(goal);
    try {
      if (!await onPurchase(progress.action)) {
        purchaseTarget.current = null;
        setPurchaseError('Purchase not confirmed. Check the Castle message and retry.');
      }
    } catch { purchaseTarget.current = null; setPurchaseError('Purchase not confirmed. Please retry.'); }
    finally { purchasing.current = false; setBusy(false); }
  };
  return <section aria-label="Current progression goal" className="rounded-2xl border border-amber-200 bg-white p-4 text-slate-900 space-y-3">
    <h2 className="font-extrabold">Your next goal</h2>
    <p className="text-xs text-slate-600">Learn → Collect Resources → build your army → battle for Gold.</p>
    {preferenceSaving && <p role="status" className="text-sm">Saving your goal…</p>}
    {unavailable ? <p role="status" className="text-sm">Reload Castle to check goal progress.</p> : !preferenceLoaded ? <p role="status" className="text-sm">{preferenceError ? 'Your saved goal is unavailable. Retry to continue.' : 'Loading your saved goal…'}</p> : goal && progress ? <>
      <h3 className="font-bold">{goalTitle(goal)}</h3>
      <p ref={status} tabIndex={-1} role="status" className="text-sm font-semibold text-brand-800">{progress.invalid ? 'This target is no longer available. Choose a new goal below.' : progress.complete ? 'Goal complete! Choose a new goal below.' : progress.ready ? 'Ready to build or upgrade!' : `${progress.affordable ? 'Affordable. ' : ''}${progress.blocker ?? 'Collect the missing Resources to make progress.'}`}</p>
      {!progress.invalid && !progress.complete && <>
        <p className="text-xs">Price: {formatCost(progress.cost)}</p>
        {progress.requiredCastle > state.castle && <div className="space-y-2"><p className="text-xs">Unlock: Castle level {progress.requiredCastle} required.</p><button type="button" className={button} disabled={busy || preferenceSaving} onClick={() => select({ type: 'castle', level: state.castle + 1 })}>Make Castle upgrade my goal</button></div>}
        <ul className="space-y-2 text-sm">
          {KNOWLEDGE_RESOURCES.filter(r => progress.cost.resources[r.topic]).map(resource => <li key={resource.key}>
            <p>{resource.name}: {state.tokens[resource.topic]} / {progress.cost.resources[resource.topic]}{progress.missing.resources[resource.topic] ? ` · Need ${progress.missing.resources[resource.topic]} more` : ' · Funded'}</p>
            {!!progress.missing.resources[resource.topic] && <button type="button" className={`${button} mt-1 w-full`} disabled={!!learningBlocked} onClick={() => onLearnTopic(resource.topic)}>Learn {resource.topic} for {resource.name}</button>}
          </li>)}
          {!!progress.cost.gold && <li><p>Gold: {state.gold} / {progress.cost.gold}{progress.missing.gold ? ` · Need ${progress.missing.gold} more` : ' · Funded'}</p>
            {!!progress.missing.gold && <><button type="button" className={`${button} mt-1 w-full`} onClick={onBattle}>{active ? 'View active battle' : hasArmy ? `Go to battle ${stageLabel(state.cleared + 1)}` : 'View battle requirements'}</button>{!hasArmy && <p className="mt-1 text-xs">Build a military building first to earn Gold in battle.</p>}</>}
          </li>}
        </ul>
        {pendingReward && <p className="text-xs text-amber-800">Uncollected rewards are not counted. Learning actions return you to Collect first.</p>}
        {learningBlocked && <p className="text-xs text-slate-600">{learningBlocked}</p>}
        {progress.affordable && <button type="button" className={`${button} w-full`} disabled={busy || preferenceSaving || !progress.ready} onClick={() => void buy()}>{busy ? 'Saving purchase…' : `Complete goal: ${goalTitle(goal)}`}</button>}
        {active && <button type="button" className="min-h-11 text-sm font-bold underline" onClick={onBattle}>Return to battle</button>}
      </>}
      {progress.complete && hasArmy && <button type="button" className={`${button} w-full`} onClick={onBattle}>{active ? 'View active battle' : `Go to battle ${stageLabel(state.cleared + 1)}`}</button>}
    </> : <p className="text-sm">Choose a construction or upgrade to guide your learning.</p>}
    <label className="block text-sm font-bold">{goal ? 'Change goal' : 'Choose a goal'}
      <select aria-label="Choose progression goal" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-900" value="" disabled={unavailable || !preferenceLoaded || preferenceSaving || busy} onChange={event => { const option = options[Number(event.target.value)]; if (option) select(option); }}>
        <option value="" disabled>Select your next goal</option>
        {options.map((option, index) => <option key={index} value={index}>{goalTitle(option)}</option>)}
      </select>
    </label>
    {!unavailable && !options.length && <p className="text-sm">All upgrades complete. Your army is ready for the campaign.</p>}
    {goal && <button type="button" className="min-h-11 text-sm font-bold text-slate-600 underline" disabled={busy || preferenceSaving} onClick={() => select(null)}>Dismiss goal</button>}
    {preferenceError && onRetryPreference && <button type="button" className={button} disabled={preferenceSaving} onClick={onRetryPreference}>Retry goal</button>}
    {(preferenceError || purchaseError) && <p role="alert" className="text-sm text-rose-700">{preferenceError || purchaseError}</p>}
  </section>;
}
