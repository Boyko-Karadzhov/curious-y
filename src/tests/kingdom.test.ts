import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, newKingdom, parseKingdom, ARMY_LIMIT, BUILDINGS, unitStats, type Kingdom } from '../lib/kingdom/game';
import { changeKingdom, loadKingdom, resetKingdom } from '../lib/kingdom/storage';
function ready() {
  let s=newKingdom();s.tokens.Physics=25;s=applyAction(s,{type:'building',id:'barracks'});
  s=applyAction(s,{type:'recruit',id:'barracks'},{requestId:'first',draws:[.5,.5,.5]});
  return applyAction(s,{type:'army',slots:['first-0',null,null,null,null]});
}
function fight(s:Kingdom) {s=applyAction(s,{type:'start',stage:s.cleared+1});while(!s.battle!.result)s=applyAction(s,{type:'tick'});return s;}
describe('Permanent recruitment and battle lifecycle',()=>{
  it('spawns automatically, preserves all owned recruits through victory, and collects Gold once',()=>{
    const s=ready(), end=fight(s);expect(end.battle!.result).toBe('victory');expect(end.units).toEqual(s.units);expect(end.gold).toBe(0);
    expect(()=>applyAction(end,{type:'start',stage:2})).toThrow(/Collect/);
    const paid=applyAction(end,{type:'collect-battle',stage:1});expect(paid.gold).toBe(60);expect(applyAction(paid,{type:'collect-battle',stage:1})).toBe(paid);
    expect(()=>applyAction(paid,{type:'start',stage:3})).toThrow(/next unbeaten/);expect(applyAction(paid,{type:'start',stage:2}).battle!.elapsed).toBe(0);
  });
  it('preserves independent spawn cadence and field limits across all five flexible slots',()=>{
    const s=newKingdom();s.castle=3;
    BUILDINGS.forEach((b,i)=>{s.buildings[b.id]=1;s.units[b.unitId]={unitId:b.unitId,investedXP:0,locked:false};s.armySlots[i]=b.unitId;});
    let started=applyAction(s,{type:'start',stage:1});const b=started.battle!;b.nextEnemy=450;
    b.fighters=Array.from({length:ARMY_LIMIT},(_,i)=>({...unitStats('militia',1),kind:'militia',side:'player',x:5,maxHp:65,id:i+1}));b.nextId=ARMY_LIMIT+1;
    b.nextSpawn=Object.fromEntries(BUILDINGS.map(u=>[u.unitId,0]));
    for(const spec of BUILDINGS){started=applyAction(started,{type:'tick'});expect(started.battle!.fighters).toHaveLength(24);started.battle!.fighters.shift();started=applyAction(started,{type:'tick'});expect(started.battle!.fighters.at(-1)!.kind).toBe(spec.unitId);}
  });
  it('freezes combat against roster edits, keeps battle speed, and resumes identical simulation after reload',()=>{
    let s=applyAction(ready(),{type:'start',stage:1});expect(s.battle!.nextSpawn).toEqual({militia:9});
    for(let i=0;i<40;i++){const next=applyAction(s,{type:'tick'});expect(applyAction(parseKingdom(JSON.stringify(s)),{type:'tick'})).toEqual(next);s=next;}
    expect(s.battle!.fighters.some(f=>f.side==='player')).toBe(true);expect(s.battle!.config.rulesVersion).toBe(12);
    expect(()=>applyAction(s,{type:'castle'})).toThrow(/battle/);expect(()=>applyAction(s,{type:'army',slots:[null,null,null,null,null]})).toThrow(/battle/);
  });
  it('handles defeat, retreat, simultaneous destruction and timeout without consuming owned units',()=>{
    let s=applyAction(ready(),{type:'start',stage:1});const owned=s.units;
    s=applyAction(s,{type:'retreat'});expect(s.units).toEqual(owned);expect(s.battle!.result).toBe('defeat');
    s=applyAction(s,{type:'start',stage:1});s.battle!.elapsed=449.75;s.battle!.nextEnemy=450;s.battle!.nextSpawn.militia=450;
    s=applyAction(s,{type:'tick'});expect(s.battle!.result).toBe('draw');expect(s.units).toEqual(owned);
    s=applyAction(s,{type:'start',stage:1});s.battle!.playerHp=1;s.battle!.enemyHp=1;s.battle!.nextId=3;
    s.battle!.fighters=[{...unitStats('militia',1),id:1,kind:'militia',side:'player',x:99,maxHp:65,attackCount:0},{...unitStats('militia',1),id:2,kind:'militia',side:'enemy',x:1,maxHp:65,attackCount:0}];
    s=applyAction(s,{type:'tick'});expect(s.battle!.result).toBe('draw');expect(applyAction(s,{type:'tick'})).toBe(s);
  });
});
describe('Castle persistence',()=>{
  beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});
  it('persists pending Gold and failed writes, then recovers the same committed collection',async()=>{
    const won=fight(ready());localStorage.setItem('curious_y_phase1_v1_alice',JSON.stringify(won));
    const fail=vi.spyOn(Storage.prototype,'setItem').mockImplementationOnce(()=>{throw new Error('quota');});
    await expect(changeKingdom('alice',{type:'collect-battle',stage:1})).rejects.toThrow(/not been applied/);fail.mockRestore();expect(loadKingdom('alice')).toEqual(won);
    await changeKingdom('alice',{type:'collect-battle',stage:1},'collect');await changeKingdom('alice',{type:'collect-battle',stage:1},'collect');expect(loadKingdom('alice').gold).toBe(60);expect(loadKingdom('bob').gold).toBe(0);
  });
  it('rejects corrupted frozen snapshots and retains the stored source',()=>{
    const s=applyAction(ready(),{type:'start',stage:1});
    for(const mutate of [(k:Kingdom)=>{k.battle!.config.rulesVersion=99 as never;},(k:Kingdom)=>{k.battle!.config.slots[0]!.hp=-1;},(k:Kingdom)=>{delete k.battle!.nextSpawn.militia;}]){const bad=structuredClone(s);mutate(bad);const raw=JSON.stringify(bad);localStorage.setItem('curious_y_phase1_v1_broken',raw);expect(()=>loadKingdom('broken')).toThrow();expect(localStorage.getItem('curious_y_phase1_v1_broken')).toBe(raw);}
  });
  it('preserves the prior save on storage failure and safely retries a reward', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(changeKingdom('alice', { type: 'answer', id: 'q', topic: 'Physics', correct: true })).rejects.toThrow(/has not been applied/);
    expect(loadKingdom('alice')).toEqual(newKingdom());
    spy.mockRestore();
    await changeKingdom('alice', { type: 'answer', id: 'q', topic: 'Physics', correct: true });
    expect(loadKingdom('alice').tokens.Physics).toBe(10);
  });
  it('surfaces corrupted saves without overwriting them and allows explicit reset', async () => {
    localStorage.setItem('curious_y_kingdom_v1_alice', '{broken');
    expect(() => loadKingdom('alice')).toThrow();
    await expect(changeKingdom('alice', { type: 'castle' })).rejects.toThrow();
    expect(localStorage.getItem('curious_y_kingdom_v1_alice')).toBe('{broken');
    resetKingdom('alice');
    expect(loadKingdom('alice')).toEqual(newKingdom());
    expect(() => parseKingdom(JSON.stringify({ ...newKingdom(), gold: -1 }))).toThrow();
    expect(() => parseKingdom(JSON.stringify({ ...newKingdom(), battle: {} }))).toThrow();
  });
});
