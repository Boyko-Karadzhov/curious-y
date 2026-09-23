import React from 'react';
import { Anvil, Coins, Shield, Wheat } from 'lucide-react';
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
                <span id="gold-source" role="tooltip" className="resource-source-tip">Collect daily income, conquer territory, win battles or trade at the Market.</span>
            </button>
            <span data-resource-food className="game-currency" aria-label={`Food ${unavailable ? '—' : state.food}`}><Wheat aria-hidden="true" className="h-4 w-4 text-lime-300" /> Food <strong>{unavailable ? '—' : state.food}</strong></span>
            <span data-resource-metal className="game-currency" aria-label={`Metal ${unavailable ? '—' : state.metal}`}><Anvil aria-hidden="true" className="h-4 w-4 text-slate-300" /> Metal <strong>{unavailable ? '—' : state.metal}</strong></span>
            {KNOWLEDGE_RESOURCES.map(resource => <button type="button" key={resource.key} data-resource-topic={resource.topic} aria-label={`${resource.name} ${unavailable ? '—' : state.tokens[resource.topic]}`} aria-describedby={`${resource.key}-source`} onClick={event => event.currentTarget.focus()} className="game-currency resource-source scroll-mt-24">
                <span aria-hidden="true" style={{ color: resource.color }}>{resource.symbol}</span>
                {resource.name} <strong>{unavailable ? '—' : state.tokens[resource.topic]}</strong>
                <span id={`${resource.key}-source`} role="tooltip" className="resource-source-tip">Learn {resource.topic} to earn {resource.name}.</span>
            </button>)}
        </div>
    </div>
);
