import React from 'react';
import { Coins, KeyRound, Sparkles } from 'lucide-react';
import { KNOWLEDGE_RESOURCES, LearningReward } from '../../game/economy';

interface LearningRewardCardProps {
  reward: LearningReward;
}

export const LearningRewardCard: React.FC<LearningRewardCardProps> = ({ reward }) => (
  <div className={`learning-reward-card ${reward.correct ? 'learning-reward-correct' : 'learning-reward-recovery'}`} data-testid="learning-reward">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="reward-seal">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">
            {reward.correct ? 'Knowledge harvested' : 'Recovery cache'}
          </p>
          <h3 className="font-display text-lg font-black text-[#34240f]">
            {reward.correct ? 'Your kingdom grows wiser' : 'Every attempt has value'}
          </h3>
          <p className="mt-0.5 text-[10px] font-semibold text-amber-900/60">
            {reward.multiplierLabel} · {reward.multiplier.toFixed(2)}× yield
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {reward.lines.map(({ key, amount }) => {
          const resource = KNOWLEDGE_RESOURCES.find((item) => item.key === key)!;
          return (
            <div key={key} className="reward-pill">
              <span className="text-base" style={{ color: resource.color, textShadow: '0 1px 1px #172033' }}>{resource.symbol}</span>
              <span className="text-xs font-black text-[#3d2b13]">+{amount}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#6f552f]">{resource.name}</span>
            </div>
          );
        })}
        <div className="reward-pill">
          <Coins className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-black text-[#3d2b13]">+{reward.gold}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-[#6f552f]">Gold</span>
        </div>
        {reward.keys > 0 && (
          <div className="reward-pill">
            <KeyRound className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-black text-[#3d2b13]">+{reward.keys}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#6f552f]">Key</span>
          </div>
        )}
      </div>
    </div>
  </div>
);
