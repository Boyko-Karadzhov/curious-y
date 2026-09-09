import React from 'react';
import { Sparkles } from 'lucide-react';
import { KNOWLEDGE_RESOURCES, type LearningReward } from '../../game/economy';
import { HelpTip } from '../common/HelpTip';

export interface AnswerReward extends LearningReward { collected: boolean }
interface LearningRewardCardProps {
  reward: AnswerReward;
  isCollecting?: boolean;
  disabled?: boolean;
  onCollect?: (source: HTMLButtonElement) => void;
}

export const LearningRewardCard: React.FC<LearningRewardCardProps> = ({ reward, isCollecting = false, disabled = false, onCollect }) => {
  return <div role="status" data-testid="learning-reward" className="learning-reward-card">
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-3"><div className="reward-seal"><Sparkles aria-hidden="true" className="h-5 w-5" /></div>
        <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{reward.correct ? 'Knowledge harvested' : 'Keep learning'}</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-display text-xl font-bold text-amber-950 sm:text-2xl" aria-label="Resources earned">{reward.lines.map(line => {
            const resource = KNOWLEDGE_RESOURCES.find(item => item.key === line.key)!;
            return <li key={line.key} data-reward-resource={line.key}>+{line.amount} {resource.name}</li>;
          })}</ul>
        </div>
      </div>
      {reward.calculation && <HelpTip label="How your reward is calculated"><p>
      Base {reward.calculation.base}
      {reward.calculation.factors.reasoning !== 1 && ` · Reasoning ×${reward.calculation.factors.reasoning}`}
      {reward.calculation.factors.correctness !== 1 && ` · Incorrect ×${reward.calculation.factors.correctness}`}
      {reward.calculation.firstSuccess && ` · First success ×${reward.calculation.factors.novelty}`}
      {reward.calculation.due && ` · Due review ×${reward.calculation.factors.review}`}
      {reward.calculation.factors.boss !== 1 && ` · Boss success ×${reward.calculation.factors.boss}`}
      {reward.calculation.factors.practice !== 1 && ` · ${!reward.calculation.inputs.metadataKnown ? 'Limited concept metadata' : reward.calculation.inputs.atomic ? 'Assumed foundation' : 'Already practiced'} ×${reward.calculation.factors.practice}`}
      {reward.calculation.lowValue && reward.calculation.raw > reward.calculation.limits.lowValueMaximum && ` · Low-value subtotal capped at ${reward.calculation.limits.lowValueMaximum}`}
      {reward.calculation.factors.repetition !== 1 && ` · Repeated low-value attempt ×${reward.calculation.factors.repetition}`}
      {reward.calculation.lowValue && ` · Low-value daily payouts are capped at ${reward.calculation.limits.lowValueFactors.map(factor => Math.max(reward.calculation!.limits.minimum, Math.round(reward.calculation!.limits.lowValueMaximum * factor))).join(', ')}, then ${reward.calculation.limits.minimum} ${reward.calculation.limits.minimum === 1 ? 'Resource' : 'Resources'} per answer (UTC).`}
      {reward.calculation.limits.minimum > 0 && ` · Every answer earns at least ${reward.calculation.limits.minimum} Resource.`}
      {reward.totalKnowledge === 0 && ' Try another reasoning skill, a new concept, or a due review. Learning remains available.'}
      </p></HelpTip>}
    </div>
    {(!reward.collected || isCollecting) && <button
      type="button"
      onClick={event => onCollect?.(event.currentTarget)}
      disabled={disabled || isCollecting}
      className="collect-reward-button mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-amber-700 px-6 py-4 text-xl font-bold text-white shadow-md transition-colors hover:bg-amber-800 active:bg-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Sparkles aria-hidden="true" className={`h-6 w-6 ${isCollecting ? 'motion-safe:animate-spin' : ''}`} />
      <span>{isCollecting ? 'Collecting…' : 'Collect'}</span>
    </button>}
  </div>;
};
