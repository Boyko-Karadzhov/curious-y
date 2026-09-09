import { useEffect, useRef, useState } from 'react';
import { Action, Kingdom, RecruitingBuilding, recruitmentCost, recruitmentOdds, formatOdds, formatCost, canAfford, missingCost, RECRUITMENT, unitDefinition, TopicName } from '../../lib/kingdom/game';
import { AvailableActionIndicator } from './AvailableActionIndicator';
import { availableCastleAction } from '../../lib/kingdom/availability';
import { UnitPortrait } from './UnitPortrait';
import './recruitment.css';

export function RecruitmentPanel({ state, id, blocked, perform, onLearn }: {
  state: Kingdom; id: RecruitingBuilding; blocked: boolean; perform: (action: Action) => Promise<boolean>; onLearn: (topic: TopicName) => void;
}) {
    const [busy,setBusy] = useState(false);
    const [result,setResult] = useState<Kingdom['lastResult']>(null);
    const seen = useRef(state.lastResult?.requestId);
    const pending = useRef(false);
    useEffect(() => {
        const committed = (event: Event) => {
            const r = (event as CustomEvent<NonNullable<Kingdom['lastResult']>>).detail;
            if (r.requestId === seen.current) {
                return;
            }
            seen.current = r.requestId;
            if (r.type === 'recruit' && r.building === id) {
                setResult(r);
            }
        };
        window.addEventListener('curious-y-roster-result',committed);
        return () => window.removeEventListener('curious-y-roster-result',committed);
    },[id]);
    const level = state.buildings[id], count = state.recruitCount[id], cost = recruitmentCost(id);
    const availableAction = level > 0 && !blocked && !busy ? availableCastleAction(state, id) : null;
    const odds = recruitmentOdds(level), next = level < RECRUITMENT.buildingCap ? recruitmentOdds(level+1) : null;
    const recruit = async () => {
        if (blocked || pending.current) {
            return;
        }
        pending.current = true; setBusy(true);
        try {
            await perform({type:'recruit',id}); 
        } finally {
            pending.current=false; setBusy(false); 
        }
    };
    return <section aria-label="Recruitment" className="mt-4 space-y-3 border-t border-slate-300 pt-4">
        <p className="text-sm">Recruit three units for <strong>{formatCost(cost)}</strong>. Every copy is yours to keep. Equip duplicates in separate slots or merge spare copies yourself. The first pack includes melee, ranged and swarm.</p>
        <p className="text-sm font-bold">{count} successful recruitments · {next ? `${count % RECRUITMENT.actionsPerLevel}/10 toward level ${level+1}` : 'MAX'}</p>
        {next && <progress className="w-full" aria-label="Building recruitment progress" value={count % RECRUITMENT.actionsPerLevel} max={RECRUITMENT.actionsPerLevel} />}
        <table className="w-full text-left text-xs"><caption className="text-left font-bold">Tier odds per recruit · five equally likely classes after your first pack</caption><thead><tr><th>Tier</th><th>Now</th><th>{next ? `Level ${level+1}` : 'MAX'}</th></tr></thead><tbody>{odds.map((p,i) => <tr key={i}><th>{i+1}</th><td>{formatOdds(p)}</td><td>{next ? formatOdds(next[i]) : '—'}</td></tr>)}</tbody></table>
        <button type="button" aria-description={availableAction ?? undefined} disabled={!availableAction} onClick={() => void recruit()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 font-bold text-white disabled:opacity-40">{availableAction && <AvailableActionIndicator label={availableAction} />}{busy ? 'Recruiting…' : `Recruit · ${formatCost(cost)}`}</button>
        {!canAfford(state,cost) && <><p className="text-sm">Need {formatCost(missingCost(state,cost))} more.</p><button type="button" className="min-h-11 text-sm underline" onClick={() => onLearn((RECRUITMENT.resources.find(t => state.tokens[t as TopicName] < RECRUITMENT.cost) ?? 'Life') as TopicName)}>Learn Earth & Life for recruitment</button></>}
        {state.battle && !state.battle.result && <p className="text-xs">Your battle uses its frozen army. New recruits and merges apply to the next battle.</p>}
        {result?.type === 'recruit' && result.building === id && <div key={result.requestId} role="status" aria-live="polite">
            {result.level > result.previousLevel && <p className="recruit-level font-bold text-emerald-700">Recruitment level {result.previousLevel} → {result.level}!</p>}
            <div className="flex gap-2">{result.recruits.map((r,i) => <div key={r.id} className={`recruit-reveal flex flex-1 flex-col items-center rounded-xl border p-2 ${r.discovered ? 'border-amber-500 bg-amber-100' : 'border-slate-300'}`} style={{animationDelay:`${i*60}ms`}}><UnitPortrait id={r.unitId} size={48}/><strong className="text-xs">{unitDefinition(r.unitId).name}</strong><span className="text-xs">Tier {unitDefinition(r.unitId).tier} · Level 1</span>{r.discovered && <span className="text-xs font-bold">New discovery!</span>}</div>)}</div>
            <p className="mt-3 text-sm font-bold">Three copies added to your collection. Prepare your army to equip them.</p>
        </div>}
    </section>;
}
