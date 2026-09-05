import React from 'react';
import { Sparkles } from 'lucide-react';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';

export interface AnswerReward { id: string; topic: string; correct: boolean; saved: boolean }
export const LearningRewardCard: React.FC<{ reward: AnswerReward; onVisitCastle: () => void; onRetry: () => void }> = ({ reward, onVisitCastle, onRetry }) => {
  const amount = reward.correct ? 10 : 3;
  const currency = KNOWLEDGE_RESOURCES.find(resource => resource.topic === reward.topic);
  return <div role="status" data-testid="learning-reward" className="learning-reward-card">
    <div className="flex items-center gap-3"><div className="reward-seal"><Sparkles className="h-5 w-5" /></div>
      <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{reward.correct ? 'Knowledge harvested' : 'Every attempt has value'}</p>
        <p className="font-display text-lg font-bold text-amber-950">{reward.saved ? `+${amount} ${reward.topic} tokens earned!` : 'Your answer reward has not been saved.'}</p>
      </div>
    </div>
    {reward.saved && <p className="mt-2 text-sm font-bold text-amber-900">{currency?.symbol} {currency?.name ?? reward.topic} +{amount}</p>}
    <p className="mt-2 text-sm text-amber-950">{reward.saved ? `Exchange for ${amount * 2} Gold to grow your Castle and army.` : 'Retry to collect these tokens once storage is available.'}</p>
    <button type="button" onClick={reward.saved ? onVisitCastle : onRetry} className="mt-3 rounded-xl bg-amber-900 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800">{reward.saved ? 'Visit Castle' : 'Retry reward'}</button>
  </div>;
};
