import React from 'react';
import { Sparkles } from 'lucide-react';
import { KNOWLEDGE_RESOURCES, type LearningReward } from '../../game/economy';

export interface AnswerReward extends LearningReward { collected: boolean }
export const LearningRewardCard: React.FC<{ reward: AnswerReward }> = ({ reward }) => {
  return <div role="status" data-testid="learning-reward" className="learning-reward-card">
    <div className="flex items-center gap-3"><div className="reward-seal"><Sparkles className="h-5 w-5" /></div>
      <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{reward.correct ? 'Knowledge harvested' : 'Keep learning'}</p>
        <p className="font-display text-lg font-bold text-amber-950">+{reward.totalKnowledge} {reward.totalKnowledge === 1 ? 'Resource' : 'Resources'} {reward.collected ? 'collected!' : 'ready to collect!'}</p>
      </div>
    </div>
    <ul className="mt-2 flex flex-wrap gap-3" aria-label="Resource breakdown">{reward.lines.map(line => {
      const resource = KNOWLEDGE_RESOURCES.find(item => item.key === line.key)!;
      return <li key={line.key} data-reward-resource={line.key}>+{line.amount} {resource.name}</li>;
    })}</ul>
    {reward.calculation && <p className="mt-2 text-xs text-amber-950" aria-label="Reward explanation">
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
    </p>}
    <p className="mt-2 text-sm text-amber-950">{reward.collected ? 'Resources added. Keep your curiosity growing.' : 'Collect your Resources above to add them to your Castle.'}</p>
  </div>;
};
