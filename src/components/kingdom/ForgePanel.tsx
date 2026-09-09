import { useRef, useState } from 'react';
import { Hammer, Coins, Shield, Sparkles, Swords } from 'lucide-react';
import { Action, Kingdom, TopicName, UNIT_CLASSES, EQUIPMENT_SLOTS, FORGE, forgeCost, FORGE_TOPICS, forgeOdds, canAfford, equipmentKey, equipmentName, equipmentSellGold, baseDescription, bonusDescription, type ForgedItem, type EquipmentSlot } from '../../lib/kingdom/game';
import { KNOWLEDGE_RESOURCES } from '../../../supabase/functions/_shared/resources';
import './forge.css';
import { SWARM_EQUIPMENT_ROOT } from '../../lib/kingdom/swarmArt';

export function EquipmentIcon({ item }: { item: Pick<ForgedItem,'unitClass'|'slot'|'tier'> }) {
    if(item.unitClass==='swarm'){
        return <span aria-hidden="true" className="forge-icon" style={{backgroundImage:`url('${SWARM_EQUIPMENT_ROOT}${item.slot}-${item.tier}.png')`,backgroundSize:'contain',backgroundPosition:'center'}}/>;
    }
    const row = UNIT_CLASSES.findIndex(c => c.id === item.unitClass) * 3 + EQUIPMENT_SLOTS.indexOf(item.slot);
    return <span aria-hidden="true" className="forge-icon" style={{ backgroundPosition: `${(item.tier-1)*25}% ${row/14*100}%` }} />;
}
const SlotIcon = ({slot}:{slot:EquipmentSlot}) => slot === 'weapon' ? <Swords size={18}/> : slot === 'armor' ? <Shield size={18}/> : <Sparkles size={18}/>;
export function EquipmentCard({item,label}:{item:ForgedItem|null;label:string}) {
    return <div className={`forge-item forge-tier-${item?.tier ?? 0}`}>
        <p className="forge-eyebrow">{label}</p>
        {item ? <><EquipmentIcon item={item}/><p className="forge-item-name">{equipmentName(item)}</p><p className="forge-tier">Tier {item.tier} · {item.slot}</p><p>{baseDescription(item)}</p><p className="forge-bonus">{bonusDescription(item.bonus)}</p><p className="forge-sale">Sells for {equipmentSellGold(item)} Gold</p></> : <p className="forge-empty">Empty slot</p>}
    </div>;
}
interface Props {state:Kingdom;perform:(action:Action)=>Promise<boolean>;blocked:boolean;onLearn?:(topic:TopicName)=>void}
export function ForgePanel({state,perform,blocked,onLearn}:Props) {
    const [busy,setBusy]=useState(false), [error,setError]=useState('');
    const pendingRequest=useRef(false);
    const item=state.forge.pending, current=item ? state.forge.equipped[equipmentKey(item)] ?? null : null;
    const level=state.buildings.forge, affordable=canAfford(state,forgeCost());
    const run=async(action:Action)=>{
        if(blocked||pendingRequest.current){
            return;
        }
        pendingRequest.current=true;setBusy(true);setError('');
        try {
            if(!await perform(action)){
                setError('Could not save your Forge action. Please retry.');
            } 
        } catch {
            setError('Could not save your Forge action. Please retry.');
        } finally{
            pendingRequest.current=false;setBusy(false);
        }
    };
    return <section className="forge-panel" aria-label="Forge workshop">
        <div className="forge-heading"><div><p className="forge-eyebrow">Learning becomes equipment</p><h3><Hammer size={22}/> The Forge <span>Level {level}</span></h3></div><span className="forge-gold"><Coins size={16}/> {state.gold.toLocaleString()} Gold</span></div>
        <p className="forge-intro">Forge one weapon, armor or artifact for any class. Equip it or sell it for Gold.</p>
        <div className="forge-workbench">
            <div className="forge-controls">
                <p className="forge-eyebrow">{state.forge.count.toLocaleString()} items forged</p>
                <progress aria-label="Forge level progress" max={FORGE.actionsPerLevel} value={level===FORGE.maxLevel ? FORGE.actionsPerLevel : state.forge.count%FORGE.actionsPerLevel}/>
                <p className="forge-muted">{level===FORGE.maxLevel ? 'Maximum Forge level · Keep forging for equipment' : `${FORGE.actionsPerLevel-state.forge.count%FORGE.actionsPerLevel} forges to level ${level+1}`}</p>
                <div className="forge-odds" aria-label="Next item tier chances">{forgeOdds(level).map((chance,i)=><div key={i}><b>T{i+1}</b><span>{chance===0 ? '0' : chance<.0001 ? '<0.01' : (chance*100).toFixed(2)}%</span></div>)}</div>
                <p className="forge-muted">Higher Forge levels improve the odds of higher tiers. All classes and item slots are equally likely.</p>
                <div className="forge-resources">{KNOWLEDGE_RESOURCES.filter(r => FORGE_TOPICS.includes(r.topic)).map(r=><button type="button" disabled={!onLearn||blocked} onClick={()=>onLearn?.(r.topic)} key={r.key} className={state.tokens[r.topic]<FORGE.resourceCost ? 'forge-short' : ''} title={`Learn ${r.topic}`}><span>{r.name}</span><b>{state.tokens[r.topic]} / {FORGE.resourceCost}</b></button>)}</div>
                <button type="button" className="forge-primary" disabled={blocked||busy||!affordable||!!item} onClick={()=>void run({type:'forge'})}><Hammer size={18}/>{busy ? 'Saving…' : `Forge · ${FORGE.resourceCost} Force + ${FORGE.resourceCost} Reagents`}</button>
                <p className="forge-muted">{item ? 'Equip or sell the item on the anvil to forge again.' : !affordable ? 'Learn the highlighted topics to replenish your resources.' : 'No Gold cost. Every forge earns progress.'}</p>
            </div>
            <div className="forge-anvil" aria-live="polite">
                {item ? <><div className="forge-comparison" key={item.id}><EquipmentCard item={item} label="Just forged"/><EquipmentCard item={current} label={`Currently equipped · ${UNIT_CLASSES.find(c=>c.id===item.unitClass)!.name}`}/></div><div className="forge-decisions"><button type="button" disabled={busy||blocked} className="forge-primary" onClick={()=>void run({type:'resolve-forge',itemId:item.id,choice:'equip'})}>{current ? `Equip & sell old · +${equipmentSellGold(current)} Gold` : 'Equip item'}</button><button type="button" disabled={busy||blocked} className="forge-secondary" onClick={()=>void run({type:'resolve-forge',itemId:item.id,choice:'sell'})}>Sell new · +{equipmentSellGold(item)} Gold</button></div><p className="forge-muted">{current ? 'Replacing this item sells the old one automatically.' : 'This item fills an empty slot.'} Your decision is saved when you leave.</p></> : <div className="forge-rest"><Hammer size={46}/><h4>The anvil is ready</h4><p>75 equipment types. Five tiers.<br/>One new possibility with every forge.</p></div>}
            </div>
        </div>
        {error&&<p role="alert" className="forge-error">{error}</p>}
        <div className="forge-collection-heading"><h4>Equipped items <span>{Object.keys(state.forge.equipped).length} / 15</span></h4><p>One item per slot. Class bonuses from every equipped item add together.</p></div>
        <div className="forge-collection">{UNIT_CLASSES.map(c=><section key={c.id} aria-label={`${c.name} equipment`} className="forge-class"><h5>{c.name}</h5><div className="forge-class-slots">{EQUIPMENT_SLOTS.map(slot=>{
            const equipped=state.forge.equipped[`${c.id}:${slot}`];return <details className={`forge-slot forge-tier-${equipped?.tier??0}`} key={slot}><summary>{equipped ? <EquipmentIcon item={equipped}/> : <span className="forge-slot-empty"><SlotIcon slot={slot}/></span>}<span>{c.id==='siege'&&slot==='weapon' ? 'Ammunition' : c.id==='siege'&&slot==='armor' ? 'Doctrine' : slot}<b>{equipped ? `Tier ${equipped.tier}` : 'Empty'}</b></span></summary>{equipped ? <div className="forge-slot-info"><b>{equipmentName(equipped)}</b><p>{baseDescription(equipped)}</p><p>{bonusDescription(equipped.bonus)}</p></div> : <p className="forge-slot-info">Forge an item for this slot to equip it.</p>}</details>;
        })}</div></section>)}</div>
        <p className="forge-muted">Weapons and fitted armor change your units’ appearance. Siege ammunition changes its projectile; Siege doctrine and all artifacts provide stats only. Equipment changes apply to the next battle.</p>
    </section>;
}
