import { describe,it,expect,beforeEach } from 'vitest';
import { newKingdom,applyAction,parseKingdom,TOPICS,FORGE,forgeOdds,forgeLevel,rollEquipment,EQUIPMENT_CATALOG,equipmentKey,equipmentSellGold,equipmentBonuses,applyEquipment,unitStats,createBattle,validForgedItem,type ForgedItem,type Kingdom } from '../lib/kingdom/game';
import { parseKingdomCommand,executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { changeKingdom,loadKingdom,resetKingdom } from '../lib/kingdom/storage';
import { resolveRosterCombat } from '../../supabase/functions/_shared/unitCombat';
const ready=()=>{const s=newKingdom();s.castle=4;for(const t of TOPICS)s.tokens[t]=1000;return applyAction(s,{type:'building',id:'forge'});};
const forge=(s:Kingdom,id='item',draws=[.01,.01,.99,.01,.01,.99])=>applyAction(s,{type:'forge'},{requestId:id,draws});
const resolve=(s:Kingdom,choice:'equip'|'sell')=>applyAction(s,{type:'resolve-forge',itemId:s.forge.pending!.id,choice});
const item=(overrides:Partial<ForgedItem>={}):ForgedItem=>({id:'item',unitClass:'melee',slot:'weapon',tier:1,bonus:{stat:'damage',target:'melee',value:15},...overrides});
describe('Forge economy and durable decisions',()=>{
    it('requires Keep 2 and construction, charges Physics and Chemistry and no Gold',()=>{
        expect(()=>forge(newKingdom())).toThrow(/Construct/);const s=ready();expect(s.buildings.forge).toBe(1);for(const t of TOPICS)expect(s.tokens[t]).toBe(['Physics','Chemistry'].includes(t)?990:1000);
        expect(()=>applyAction({...s,castle:1,buildings:{...s.buildings,forge:0}},{type:'building',id:'forge'})).toThrow(/Keep/);
        expect(()=>applyAction(s,{type:'building',id:'forge'})).toThrow(/earned/);
        const f=forge(s);for(const t of TOPICS)expect(f.tokens[t]).toBe(['Physics','Chemistry'].includes(t)?982:1000);expect(f.gold).toBe(0);expect(f.forge.count).toBe(1);expect(s.forge.count).toBe(0);
        for(const t of ['Physics','Chemistry'] as const){const poor=ready();poor.tokens[t]=1;expect(()=>forge(poor)).toThrow(/need/);expect(poor.forge.pending).toBeNull();}
    });
    it('requires one decision, replaces only the matching slot and credits each sale once',()=>{
        const pending=forge(ready());expect(parseKingdom(JSON.stringify(pending))).toEqual(pending);expect(()=>forge(pending,'second')).toThrow(/Equip or sell/);
        const equipped=resolve(pending,'equip');expect(equipped.gold).toBe(0);expect(Object.keys(equipped.forge.equipped)).toEqual(['melee:weapon']);
        const replaced=resolve(forge(equipped,'replacement'),'equip');expect(replaced.gold).toBe(8);expect(replaced.forge.equipped['melee:weapon']!.id).toBe('replacement');
        const sold=resolve(forge(replaced,'sold'),'sell');expect(sold.gold).toBe(16);expect(sold.forge.equipped).toEqual(replaced.forge.equipped);expect(()=>applyAction(sold,{type:'resolve-forge',itemId:'sold',choice:'sell'})).toThrow();
        expect(()=>applyAction(pending,{type:'resolve-forge',itemId:'stale',choice:'equip'})).toThrow();expect(()=>forge(equipped,'item')).toThrow(/identity/);
    });
    it('uses pre-forge odds, levels every ten actions, continues at the cap',()=>{
        let s=ready();for(let n=1;n<=10;n++){s=forge(s,`item-${n}`,[0,0,0,0,0,0]);expect(s.forge.pending!.tier).toBe(1);s=resolve(s,'sell');}expect(s.buildings.forge).toBe(2);
        expect(forge(s,'eleven',[0,0,0,0,0,0]).forge.pending!.tier).toBe(5);
        s.forge.count=989;s.buildings.forge=99;s=resolve(forge(s,'cap'),'sell');expect(s.buildings.forge).toBe(100);s=forge(s,'beyond');expect(s.buildings.forge).toBe(100);expect(s.forge.count).toBe(991);expect(forgeLevel(10000)).toBe(100);
    });
    it('defines exactly 75 types and bounded independent class, slot, tier and bonus rolls',()=>{
        expect(EQUIPMENT_CATALOG).toHaveLength(75);expect(new Set(EQUIPMENT_CATALOG.map(i=>i.name)).size).toBe(75);
        for(const c of [0,.2,.4,.6,.8])for(const slot of [0,1/3,2/3])for(const stat of [0,.2,.4,.6,.8])for(const endpoint of [0,.999999]){const i=rollEquipment(100,'roll',[c,slot,endpoint,stat,c,endpoint]);expect(validForgedItem(i)).toBe(true);expect(equipmentSellGold(i)).toBeGreaterThan(0);}
        for(let level=1;level<=100;level++)expect(forgeOdds(level).reduce((a,b)=>a+b,0)).toBeCloseTo(1,12);
        for(const draws of [[],[0,0,0],[0,0,1,0,0,0],[0,0,0,NaN,0,0]])expect(()=>rollEquipment(1,'id',draws)).toThrow();
    });
    it('rejects damaged current saves, impossible bonuses, duplicated ids and mismatched slots',()=>{
        const s=resolve(forge(ready()),'equip');
        for(const mutate of [(x:Kingdom)=>{delete (x as Partial<Kingdom>).forge;},(x:Kingdom)=>{x.forge.equipped['ranged:weapon']=item();},(x:Kingdom)=>{x.forge.pending=item();},(x:Kingdom)=>{x.forge.count=0;},(x:Kingdom)=>{x.forge.equipped['melee:weapon']!.bonus.value=51;},(x:Kingdom)=>{x.buildings.forge=3;}]){const bad=structuredClone(s);mutate(bad);expect(()=>parseKingdom(JSON.stringify(bad))).toThrow();}
        const old={...newKingdom(),version:9};delete (old as {forge?:unknown}).forge;expect(parseKingdom(JSON.stringify(old)).forge).toEqual(newKingdom().forge);
    });
    it('accepts only intent and executes server-provided draws',()=>{
        const command=parseKingdomCommand({type:'forge',draws:[0,0,0,0,0,0],item:item({tier:5}),cost:0});expect(command).toEqual({type:'forge'});
        expect(parseKingdomCommand({type:'resolve-forge',itemId:'item',choice:'sell',gold:99999})).toEqual({type:'resolve-forge',itemId:'item',choice:'sell'});
        expect(()=>parseKingdomCommand({type:'resolve-forge',itemId:'item',choice:'keep'})).toThrow();
        const c={state:ready(),revision:0,generation:0,battle_clock:null,server_now:new Date().toISOString()};expect(()=>executeKingdomCommand(c,command)).toThrow();expect(executeKingdomCommand(c,command,{requestId:'server',draws:[0,0,.99,0,0,0]}).state.forge.pending!.tier).toBe(1);
    });
});
describe('Equipment combat effects',()=>{
    it('adds bonuses from all holders, uses speed as a rate, and grants range only to ranged and siege',()=>{
        const a=item({id:'a',bonus:{stat:'spawnSpeed',target:'ranged',value:5}}),b=item({id:'b',unitClass:'swarm',slot:'artifact',bonus:{stat:'spawnSpeed',target:'ranged',value:5}}),c=item({id:'c',slot:'armor',bonus:{stat:'range',target:'all-ranged',value:2}});
        const eq=Object.fromEntries([a,b,c].map(i=>[equipmentKey(i),i]));expect(equipmentBonuses(eq,'ranged').spawnSpeed).toBe(10);
        const u=unitStats('archer',1),buff=applyEquipment(u,eq);expect(buff.spawnInterval).toBeCloseTo(u.spawnInterval/1.1);expect(buff.range).toBeCloseTo(u.range*1.02);expect(applyEquipment(unitStats('medic',1),eq).range).toBe(unitStats('medic',1).range);
    });
    it('uses healer damage as healing power and attack speed as healing rate; preserves budget at faster rate',()=>{
        const eq={'healer:weapon':item({unitClass:'healer',bonus:{stat:'attackSpeed',target:'healer',value:15}})};const u=unitStats('medic',1),buff=applyEquipment(u,eq);
        expect(buff.damage).toBe(0);expect(buff.healPerSecond).toBeCloseTo(u.healPerSecond!*1.1*1.15);expect(buff.healBudget).toBeCloseTo(u.healBudget!*1.1);expect(buff.attackInterval).toBeCloseTo(u.attackInterval!/1.15);
    });
    it('freezes equipment, excludes artifact and siege armor visuals, and retains battle config after replacement',()=>{
        let s=resolve(forge(ready()),'equip');s.buildings.barracks=1;s.units.a={unitId:'militia',investedXP:0,locked:false};s.armySlots[0]='a';s=applyAction(s,{type:'start',stage:1});const battle=structuredClone(s.battle);s=resolve(forge(s,'second'),'equip');expect(s.battle).toEqual(battle);expect(s.battle!.config.slots[0]!.equipment).toEqual({weapon:1,armor:0});
        expect(applyEquipment(unitStats('catapult',1),{'siege:armor':item({unitClass:'siege',slot:'armor'}),'siege:weapon':item({unitClass:'siege'})}).equipment).toEqual({weapon:1,armor:0});
    });
    it('delivers small attack speed gains without tick rounding, including multiple attacks per tick',()=>{
        const attacks=(bonus:number)=>{const s=ready();const b=createBattle({...s,buildings:{...s.buildings,barracks:1},units:{a:{unitId:'militia',investedXP:0,locked:false}},armySlots:['a',null,null,null,null]});const u=unitStats('militia',1);b.fighters=[{...u,id:1,kind:'militia',side:'player',x:100,maxHp:u.hp,cooldown:0,healingLeft:0,attackCount:0,attackInterval:1/(1+bonus/100)}];b.enemyHp=1000000;for(let n=0;n<400;n++){b.elapsed+=.25;resolveRosterCombat(b,.25);}return b.fighters[0].attackCount!;};
        expect(attacks(5)).toBeGreaterThan(attacks(0));expect(attacks(50)/attacks(0)).toBeCloseTo(1.5,1);expect(attacks(750)).toBeGreaterThan(800);
    });
});
describe('Demo Forge retry persistence',()=>{
    beforeEach(()=>localStorage.clear());
    it('deduplicates forging and sale across reload and rejects old generations',async()=>{
        const user='forge-test';localStorage.setItem(`curious_y_phase1_v1_${user}`,JSON.stringify(ready()));
        const first=await changeKingdom(user,{type:'forge'},'request');expect(await changeKingdom(user,{type:'forge'},'request')).toEqual(first);expect(loadKingdom(user).forge.pending).toEqual(first.forge.pending);
        const action={type:'resolve-forge' as const,itemId:first.forge.pending!.id,choice:'sell' as const};const sold=await changeKingdom(user,action,'sale');expect(await changeKingdom(user,action,'sale')).toEqual(sold);expect(sold.gold).toBe(FORGE.sellGold[0]);
        resetKingdom(user);expect(loadKingdom(user).forge.count).toBe(0);await expect(changeKingdom(user,action,'sale','0')).rejects.toThrow(/reset/);
    });
});
