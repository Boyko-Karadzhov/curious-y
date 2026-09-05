import React, { useState } from 'react';
import { ChevronDown, Coins, Shield } from 'lucide-react';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';
import { Kingdom } from '../../lib/kingdom/game';

export const ResourceBar: React.FC<{ state: Kingdom; unavailable?: boolean }> = ({ state, unavailable }) => {
  const [expanded, setExpanded] = useState(false);
  return <div className="resource-bar relative z-20 border-b border-white/10 bg-[#0a1624]/95 text-white" aria-label="Phase I resources">
    <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="game-currency"><Shield className="h-4 w-4 text-amber-300" /> Castle {unavailable ? '—' : state.castle}</span>
        <span className="game-currency game-currency-gold"><Coins className="h-4 w-4" /> {unavailable ? '—' : state.gold} Gold</span>
        <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls="topic-resource-balances" className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold" aria-label="Toggle knowledge resources">Topic currencies <ChevronDown className={`h-3 w-3 ${expanded ? 'rotate-180' : ''}`} /></button>
      </div>
      {expanded && <div id="topic-resource-balances" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KNOWLEDGE_RESOURCES.map(resource => <div key={resource.key} className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs" title={`${resource.topic} tokens. Exchange each token for 2 Gold.`}>
          <span style={{ color: resource.color }}>{resource.symbol} {resource.name}</span><strong className="ml-2">{unavailable ? '—' : state.tokens[resource.topic]}</strong>
          <p className="mt-1 text-[10px] text-slate-400">{resource.topic} · 2 Gold/token</p>
        </div>)}
      </div>}
    </div>
  </div>;
};
