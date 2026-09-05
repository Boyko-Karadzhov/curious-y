import React from 'react';
import { Sparkles } from 'lucide-react';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';

export interface AnswerReward { id: string; topic: string; correct: boolean; collected: boolean }
export const LearningRewardCard: React.FC<{ reward: AnswerReward }> = ({ reward }) => {
  const amount = reward.correct ? 10 : 3;
  const resource = KNOWLEDGE_RESOURCES.find(resource => resource.topic === reward.topic);
  return <div role="status" data-testid="learning-reward" className="learning-reward-card">
    <div className="flex items-center gap-3"><div className="reward-seal"><Sparkles className="h-5 w-5" /></div>
      <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{reward.correct ? 'Knowledge harvested' : 'Every attempt has value'}</p>
        <p className="font-display text-lg font-bold text-amber-950">+{amount} {resource?.name ?? reward.topic} {reward.collected ? 'collected!' : 'ready to collect!'}</p>
      </div>
    </div>
    <p className="mt-2 text-sm text-amber-950">{reward.collected ? 'Resources added. Keep your curiosity growing.' : 'Collect your Resources above to add them to your Castle.'}</p>
  </div>;
};
