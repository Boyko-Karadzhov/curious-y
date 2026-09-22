import React from 'react';
import { Coins, Shield } from 'lucide-react';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';
import { Kingdom } from '../../lib/kingdom/game';

export const ResourceBar: React.FC<{
    state: Kingdom;
    unavailable?: boolean
}> = ({ state, unavailable }) => (
    <div className="resource-bar relative z-20 border-b border-white/10 bg-[#0a1624]/95 text-white" role="region" aria-label="Resources">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
            <span className="game-currency"><Shield className="h-4 w-4 text-amber-300" /> Castle {unavailable ? '—' : state.castle}</span>
            <button type="button" data-resource-gold aria-label={`Gold ${unavailable ? '—' : state.gold}`} aria-describedby="gold-source" onClick={event => event.currentTarget.focus()} className="game-currency game-currency-gold resource-source scroll-mt-24"><Coins className="h-4 w-4" /> Gold {unavailable ? '—' : state.gold}
                <span id="gold-source" role="tooltip" className="resource-source-tip">Win battles to earn Gold.</span>
            </button>
            {KNOWLEDGE_RESOURCES.map(resource => <button type="button" key={resource.key} data-resource-topic={resource.topic} aria-label={`${resource.name} ${unavailable ? '—' : state.tokens[resource.topic]}`} aria-describedby={`${resource.key}-source`} onClick={event => event.currentTarget.focus()} className="game-currency resource-source scroll-mt-24">
                <span aria-hidden="true" style={{ color: resource.color }}>{resource.symbol}</span>
                {resource.name} <strong>{unavailable ? '—' : state.tokens[resource.topic]}</strong>
                <span id={`${resource.key}-source`} role="tooltip" className="resource-source-tip">Learn {resource.topic} to earn {resource.name}.</span>
            </button>)}
        </div>
    </div>
);
