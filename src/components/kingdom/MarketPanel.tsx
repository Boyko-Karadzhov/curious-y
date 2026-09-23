import { useState } from 'react';
import { KNOWLEDGE_RESOURCES } from '../../../supabase/functions/_shared/resources';
import { tradeCost, tradeYield, type Action, type Kingdom, type TradeResource } from '../../lib/kingdom/game';

const labels: Record<string, string> = Object.fromEntries(KNOWLEDGE_RESOURCES.map(resource => [resource.topic, resource.name]));
const economic: TradeResource[] = ['gold', 'food', 'metal'];
const knowledge: TradeResource[] = KNOWLEDGE_RESOURCES.map(resource => resource.topic);
const name = (resource: TradeResource) => labels[resource] ?? resource[0].toUpperCase() + resource.slice(1);

export function MarketPanel({ state, perform, blocked }: {
    state: Kingdom;
    perform: (action: Action) => Promise<boolean>;
    blocked: boolean
}) {
    const [group, setGroup] = useState<'economic' | 'knowledge'>('economic');
    const [from, setFrom] = useState<TradeResource>('gold');
    const [to, setTo] = useState<TradeResource>('food');
    const [amount, setAmount] = useState(1);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const options = group === 'economic' ? economic : knowledge;
    const cost = tradeCost(from, to, amount, state.buildings.market);
    const available = knowledge.includes(from) ? state.tokens[from as keyof typeof state.tokens] : state[from as 'gold' | 'food' | 'metal'];
    const run = async () => {
        setBusy(true);
        try {
            setNotice(await perform({
                type: 'trade',
                from,
                to,
                amount
            }) ? 'Trade complete.' : 'Trade failed. Please retry.');
        } finally {
            setBusy(false);
        }
    };

    return <section aria-label="Market trading" className="mt-4 space-y-3 border-t border-slate-300 pt-4 text-sm">
        <h4 className="font-bold">Market trading</h4>
        <p>Trade Gold, Food and Metal with each other. Exchange knowledge resources with other knowledge resources at 2:1. The two groups never cross.</p>
        <div className="flex gap-2">{(['economic', 'knowledge'] as const).map(value => <button type="button" key={value} aria-pressed={group === value} className="rounded-lg border px-3 py-2 aria-pressed:bg-amber-100" onClick={() => {
            setGroup(value); setFrom(value === 'economic' ? 'gold' : knowledge[0]); setTo(value === 'economic' ? 'food' : knowledge[1]);
        }}>{value === 'economic' ? 'Supplies' : 'Knowledge'}</button>)}</div>
        <label className="block">Give<select className="mt-1 w-full rounded-lg border p-2" value={from} onChange={event => {
            const next = event.target.value as TradeResource; setFrom(next); if (next === to) {
                setTo(options.find(item => item !== next)!);
            }
        }}>{options.map(item => <option key={item} value={item}>{name(item)}</option>)}</select></label>
        <label className="block">Receive<select className="mt-1 w-full rounded-lg border p-2" value={to} onChange={event => {
            const next = event.target.value as TradeResource; setTo(next); if (next === from) {
                setFrom(options.find(item => item !== next)!);
            }
        }}>{options.map(item => <option key={item} value={item}>{name(item)}</option>)}</select></label>
        <label className="block">Amount to receive<input className="mt-1 w-full rounded-lg border p-2" type="number" min="1" max="1000" value={amount} onChange={event => setAmount(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))} /></label>
        <p>Give {cost} {name(from)} · Receive {tradeYield(from, to, amount, state.buildings.market)} {name(to)}</p>
        <button type="button" className="min-h-11 w-full rounded-xl bg-brand-600 px-4 text-white disabled:opacity-40" disabled={blocked || busy || available < cost} onClick={() => void run()}>{busy ? 'Trading…' : 'Trade'}</button>
        <p role="status">{notice}</p>
    </section>;
}
