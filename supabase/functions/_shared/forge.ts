import tuning from './forge-tuning.json' with { type: 'json' };
import { recruitmentOdds, safeXP } from './recruitment.ts';
import { UNIT_CLASSES, unitDefinition, type UnitClass } from './units.ts';
import type { EffectiveUnit } from './kingdom.ts';

export const FORGE = tuning;
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'artifact'] as const;
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];
export type EquipmentKey = `${UnitClass}:${EquipmentSlot}`;
export type BonusStat = 'damage' | 'hp' | 'attackSpeed' | 'spawnSpeed' | 'range';
export interface EquipmentBonus { stat: BonusStat; target: UnitClass | 'all-ranged'; value: number }
export interface ForgedItem { id: string; unitClass: UnitClass; slot: EquipmentSlot; tier: number; bonus: EquipmentBonus }
export type Equipment = Partial<Record<EquipmentKey, ForgedItem>>;
export interface ForgeState { count: number; pending: ForgedItem | null; equipped: Equipment }
export interface EquipmentVisual { weapon: number; armor: number }
export const emptyForge = (): ForgeState => ({ count:0, pending:null, equipped:{} });
export const equipmentKey = (item: Pick<ForgedItem,'unitClass'|'slot'>): EquipmentKey => `${item.unitClass}:${item.slot}`;
export const forgeLevel = (count: number) => Math.min(FORGE.maxLevel, 1 + Math.floor(safeXP(count) / FORGE.actionsPerLevel));
export const forgeOdds = recruitmentOdds;
export const equipmentSellGold = (item: ForgedItem) => FORGE.sellGold[item.tier-1];
export const equipmentBase = (item: Pick<ForgedItem,'slot'|'tier'>) => (item.slot === 'weapon' ? FORGE.baseWeapon : item.slot === 'armor' ? FORGE.baseArmor : FORGE.baseArtifact)[item.tier-1];
export const bonusBounds = (stat: BonusStat, tier: number) => (stat === 'spawnSpeed' ? FORGE.spawnRolls : stat === 'range' ? FORGE.rangeRolls : FORGE.powerRolls)[tier-1];
const materials = ['Iron', 'Tempered', 'Runic', 'Dawnsteel', 'Sunsteel'];
const objects: Record<UnitClass, Record<EquipmentSlot,string>> = {
    melee:{weapon:'Sword',armor:'Cuirass',artifact:'War Sigil'},
    ranged:{weapon:'Bow',armor:'Brigandine',artifact:'Eagle Seal'},
    swarm:{weapon:'Mandibles',armor:'Chitin',artifact:'Hive Crest'},
    healer:{weapon:'Staff',armor:'Vestments',artifact:'Life Talisman'},
    siege:{weapon:'Ammunition',armor:'Fortification Doctrine',artifact:'Siege Compass'},
};
export const equipmentName = (item: Pick<ForgedItem,'unitClass'|'slot'|'tier'>) => `${materials[item.tier-1]} ${objects[item.unitClass][item.slot]}`;
export const EQUIPMENT_CATALOG = UNIT_CLASSES.flatMap(c => EQUIPMENT_SLOTS.flatMap(slot => Array.from({length:5},(_,i) => ({unitClass:c.id,slot,tier:i+1,name:equipmentName({unitClass:c.id,slot,tier:i+1})}))));
export function baseDescription(item: Pick<ForgedItem,'unitClass'|'slot'|'tier'>) {
    const name = UNIT_CLASSES.find(c=>c.id===item.unitClass)!.name;
    return `+${equipmentBase(item)}% ${name.toLowerCase()} ${item.slot==='armor' ? 'HP' : item.slot==='artifact' ? 'spawn speed' : item.unitClass==='healer' ? 'healing power' : 'damage'}`;
}

export function bonusDescription(bonus: EquipmentBonus) {
    if(bonus.stat==='range'){
        return `+${bonus.value}% range for ranged and siege units`;
    }

    const name=UNIT_CLASSES.find(c=>c.id===bonus.target)!.name.toLowerCase();
    const stat=bonus.stat==='damage' ? bonus.target==='healer' ? 'healing power' : 'damage' : bonus.stat==='hp' ? 'HP' : bonus.stat==='spawnSpeed' ? 'spawn speed' : bonus.target==='healer' ? 'healing rate' : 'attack speed';
    return `+${bonus.value}% ${name} ${stat}`;
}

export function rollEquipment(level: number, id: string, draws: number[]): ForgedItem {
    if(!/^[a-zA-Z0-9-]{1,100}$/.test(id) || draws.length!==6 || draws.some(d=>!Number.isFinite(d)||d<0||d>=1)){
        throw new Error('Forging requires server-owned random draws.');
    }

    const odds=forgeOdds(level); let tier=1, cumulative=0;
    for(let t=5;t>=1;t--){
        cumulative+=odds[t-1];if(draws[2]<cumulative || t===1){
            tier=t;break;
        }
    }

    const stat=(['damage','hp','attackSpeed','spawnSpeed','range'] as const)[Math.floor(draws[3]*5)];
    const [low,high]=bonusBounds(stat,tier);
    return {id,unitClass:UNIT_CLASSES[Math.floor(draws[0]*5)].id,slot:EQUIPMENT_SLOTS[Math.floor(draws[1]*3)],tier,
        bonus:{stat,target:stat==='range' ? 'all-ranged' : UNIT_CLASSES[Math.floor(draws[4]*5)].id,value:low+Math.floor(draws[5]*(high-low+1))}};
}

export function validForgedItem(value: unknown): value is ForgedItem {
    if(!value || typeof value!=='object' || Array.isArray(value)){
        return false;
    }

    const i=value as ForgedItem, b=i.bonus;
    if(Object.keys(i).sort().join(',')!=='bonus,id,slot,tier,unitClass' || typeof i.id!=='string' || !/^[a-zA-Z0-9-]{1,100}$/.test(i.id)
    || !UNIT_CLASSES.some(c=>c.id===i.unitClass) || !EQUIPMENT_SLOTS.includes(i.slot) || !Number.isInteger(i.tier)||i.tier<1||i.tier>5
    || !b || typeof b!=='object' || Object.keys(b).sort().join(',')!=='stat,target,value'
    || !['damage','hp','attackSpeed','spawnSpeed','range'].includes(b.stat)){
        return false;
    }

    const [low,high]=bonusBounds(b.stat,i.tier);
    return Number.isInteger(b.value) && b.value>=low && b.value<=high && (b.stat==='range' ? b.target==='all-ranged' : UNIT_CLASSES.some(c=>c.id===b.target));
}

export function validForge(value: unknown, building: number): value is ForgeState {
    if(!value || typeof value!=='object' || Array.isArray(value)){
        return false;
    }

    const f=value as ForgeState;
    if(Object.keys(f).sort().join(',')!=='count,equipped,pending' || !Number.isSafeInteger(f.count)||f.count<0 || !f.equipped || typeof f.equipped!=='object' || Array.isArray(f.equipped)){
        return false;
    }

    const entries=Object.entries(f.equipped);
    if(entries.length>15 || entries.some(([key,item])=>!validForgedItem(item)||equipmentKey(item)!==key) || f.pending!==null&&!validForgedItem(f.pending)){
        return false;
    }

    const ids=[...entries.map(([,item])=>item.id),...(f.pending ? [f.pending.id]:[])];
    return new Set(ids).size===ids.length && f.count>=ids.length && (building===0 ? f.count===0&&ids.length===0 : building===forgeLevel(f.count));
}

export function equipmentBonuses(equipped: Equipment, unitClass: UnitClass) {
    const totals={damage:0,hp:0,attackSpeed:0,spawnSpeed:0,range:0};
    for(const item of Object.values(equipped)){
        if(!item){
            continue;
        }

        if(item.unitClass===unitClass){
            totals[item.slot==='weapon'?'damage':item.slot==='armor'?'hp':'spawnSpeed']+=equipmentBase(item);
        }

        if(item.bonus.target===unitClass || item.bonus.target==='all-ranged' && (unitClass==='ranged'||unitClass==='siege')){
            totals[item.bonus.stat]+=item.bonus.value;
        }
    }

    return totals;
}

export function applyEquipment(unit: EffectiveUnit, equipped: Equipment): EffectiveUnit {
    const unitClass=unitDefinition(unit.id).unitClass, b=equipmentBonuses(equipped,unitClass);
    const power=1+b.damage/100, rate=1+b.attackSpeed/100;
    return {...unit,hp:unit.hp*(1+b.hp/100),damage:unit.damage*power,range:unit.range*(1+b.range/100),
        spawnInterval:unit.spawnInterval/(1+b.spawnSpeed/100),attackInterval:(unit.attackInterval??1)/rate,
        // Damage-period packets stay unchanged: a faster interval gives more attacks.
        healPerSecond:(unit.healPerSecond??0)*power*rate,healBudget:(unit.healBudget??0)*power,
        equipment:{weapon:equipped[`${unitClass}:weapon`]?.tier??0,armor:unitClass==='siege'?0:equipped[`${unitClass}:armor`]?.tier??0}};
}
