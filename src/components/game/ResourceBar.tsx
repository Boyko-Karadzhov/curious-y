import React from 'react';
import { Coins, Shield } from 'lucide-react';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';
import { Kingdom } from '../../lib/kingdom/game';

export const ResourceBar: React.FC<{ state: Kingdom; unavailable?: boolean }> = ({ state, unavailable }) => (
  <div className="resource-bar relative z-20 border-b border-white/10 bg-[#0a1624]/95 text-white" role="region" aria-label="Resources">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
      <span className="game-currency"><Shield className="h-4 w-4 text-amber-300" /> Castle {unavailable ? '—' : state.castle}</span>
      <span className="game-currency game-currency-gold"><Coins className="h-4 w-4" /> Gold {unavailable ? '—' : state.gold}</span>
      {KNOWLEDGE_RESOURCES.map(resource => <span key={resource.key} className="game-currency">
        <span aria-hidden="true" style={{ color: resource.color }}>{resource.symbol}</span>
        {resource.name} <strong>{unavailable ? '—' : state.tokens[resource.topic]}</strong>
      </span>)}
    </div>
  </div>
);
