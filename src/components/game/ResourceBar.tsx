import React, { useState } from 'react';
import { ChevronDown, Coins, Gem, KeyRound, Shield } from 'lucide-react';
import { GameState, KNOWLEDGE_RESOURCES } from '../../game/economy';

interface ResourceBarProps {
  state: GameState;
}

const formatValue = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value;

export const ResourceBar: React.FC<ResourceBarProps> = ({ state }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="resource-bar relative z-20 border-b border-white/10 bg-[#0a1624]/95 text-white shadow-lg backdrop-blur-xl">
      <div className="mx-auto flex min-h-12 max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 no-scrollbar">
        <div className="mr-1 hidden items-center gap-2 border-r border-white/10 pr-3 sm:flex">
          <Shield className="h-4 w-4 text-amber-300" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Keep {state.castleLevel}</span>
        </div>

        <div className="game-currency game-currency-gold" title="Gold">
          <Coins className="h-3.5 w-3.5" />
          <span>{formatValue(state.gold)}</span>
        </div>
        <div className="game-currency game-currency-gems" title="Gems">
          <Gem className="h-3.5 w-3.5" />
          <span>{state.gems}</span>
        </div>
        <div className="game-currency game-currency-keys" title="Archive Keys">
          <KeyRound className="h-3.5 w-3.5" />
          <span>{state.keys}</span>
        </div>

        <div className="h-6 w-px shrink-0 bg-white/10" />

        <div className={`${expanded ? 'flex' : 'hidden md:flex'} items-center gap-1.5`}>
          {KNOWLEDGE_RESOURCES.map((resource) => (
            <div
              key={resource.key}
              className="game-currency game-currency-knowledge"
              title={`${resource.name}: ${resource.description}`}
            >
              <span className="text-sm leading-none" style={{ color: resource.color }}>{resource.symbol}</span>
              <span>{formatValue(state.knowledge[resource.key])}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300 md:hidden"
          aria-label="Toggle knowledge resources"
        >
          <span>Knowledge</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};
