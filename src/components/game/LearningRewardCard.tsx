import React from 'react';
import { Sparkles } from 'lucide-react';
import { KNOWLEDGE_RESOURCES, type LearningReward } from '../../game/economy';

export interface AnswerReward extends LearningReward { collected: boolean }
export const LearningRewardCard: React.FC<{ reward: AnswerReward }> = ({ reward }) => {
  return <div role="status" data-testid="learning-reward" className="learning-reward-card">
    <div className="flex items-center gap-3"><div className="reward-seal"><Sparkles className="h-5 w-5" /></div>
      <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-800">{reward.correct ? 'Knowledge harvested' : 'Every attempt has value'}</p>
        <p className="font-display text-lg font-bold text-amber-950">+{reward.totalKnowledge} Resources {reward.collected ? 'collected!' : 'ready to collect!'}</p>
      </div>
    </div>
    <ul className="mt-2 flex flex-wrap gap-3" aria-label="Resource breakdown">{reward.lines.map(line => {
      const resource = KNOWLEDGE_RESOURCES.find(item => item.key === line.key)!;
      return <li key={line.key} data-reward-resource={line.key}>+{line.amount} {resource.name}</li>;
    })}</ul>
    <p className="mt-2 text-sm text-amber-950">{reward.collected ? 'Resources added. Keep your curiosity growing.' : 'Collect your Resources above to add them to your Castle.'}</p>
  </div>;
};
