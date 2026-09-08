import { describe, expect, it } from 'vitest';
import { advanceBattle, applyAction, capacityUsed, createBattle, dailyTribute, newKingdom, parseKingdom, replayBattle, settleBattle, type Kingdom } from '../lib/kingdom/game';
const at = (now: string) => ({requestId:'answer',draws:[],now});
const answer = (s: Kingdom, id: string, correct: boolean, now = '2026-09-08T12:00:00Z') => applyAction(s,{type:'answer',id,topic:'Life',correct},at(now));
describe('Territory tribute', () => {
  it('requires correctness, pays without a Treasury, and never double pays', () => {
    let s = newKingdom();s.cleared=3;
    s=answer(s,'wrong',false);expect(s.gold).toBe(0);
    s=answer(s,'right',true);expect(s.gold).toBe(30);expect(s.lifetimeGold).toBe(30);
    expect(answer(s,'right',true)).toEqual(s);
    expect(answer(s,'another',true).gold).toBe(30);
  });
  it('expires missed days, keeps savings, and resets at UTC midnight', () => {
    let s=newKingdom();s.cleared=2;s=answer(s,'one',true,'2026-09-08T23:59:59Z');
    s=answer(s,'two',true,'2026-09-09T00:00:00Z');expect(s.gold).toBe(40);
    s=answer(s,'three',true,'2026-09-20T12:00:00Z');expect(s.gold).toBe(60);
    expect(s.tribute.paid).toBe(20);expect(dailyTribute(10,5)).toBe(110);
  });
  it('gives the first conquest income when already qualified, later conquests start tomorrow', () => {
    let s=newKingdom();s.buildings.barracks=1;s.units.a={unitId:'champion',investedXP:0,locked:false};s.armySlots[0]='a';
    s=answer(s,'qualified',true);expect(s.tribute.claimed).toBe(false);
    s=settleBattle(applyAction(s,{type:'start',stage:1},at('2026-09-08T12:00:01Z')));
    expect(s.cleared).toBe(1);expect(s.gold).toBe(10);expect(s.tribute.claimed).toBe(true);
    s=applyAction(s,{type:'collect-battle',stage:1},at('2026-09-08T12:00:02Z'));
    s=settleBattle(applyAction(s,{type:'start',stage:2},at('2026-09-08T12:00:03Z')));
    expect(s.cleared).toBe(2);expect(s.tribute.territories).toBe(1);expect(s.gold).toBe(70);
    expect(answer(s,'tomorrow',true,'2026-09-09T12:00:00Z').gold).toBe(90);
  });
});
describe('Independent deployment groups', () => {
  const army = (swarm=false) => {
    const s=newKingdom();s.buildings.barracks=1;
    for(let i=0;i<5;i++){s.units[`copy-${i}`]={unitId:swarm?'hatchling':'militia',investedXP:i*20,locked:false};s.armySlots[i]=`copy-${i}`;}
    return s;
  };
  it('allows repeated types, rejects the same copy twice, and preserves five independent timers on reload', () => {
    const s=army();expect(parseKingdom(JSON.stringify(s))).toEqual(s);
    expect(()=>applyAction(s,{type:'army',slots:['copy-0','copy-0',null,null,null]})).toThrow(/separate/);
    const b=advanceBattle(createBattle(s),36);expect(b.playerSpawned).toBe(5);expect(Object.keys(b.nextSpawn)).toEqual(['0','1','2','3','4']);
    expect(b.fighters.filter(f=>f.side==='player').map(f=>f.slotIndex)).toEqual([0,1,2,3,4]);
    expect(parseKingdom(JSON.stringify({...s,battle:b})).battle).toEqual(b);
    expect(advanceBattle(replayBattle(b),36)).toEqual(b);
  });
  it('reserves a swarm group until the final creature dies and caps at 32 groups / 160 creatures', () => {
    const s=army(true);let b=createBattle(s);b.config.enemy.firstSpawn=450;b.nextEnemy=450;b.enemyHp=b.enemyMaxHp=1e9;
    b.config.slots.forEach(u=>{if(u)u.speed=.01;});
    b=advanceBattle(b,72);expect(b.fighters).toHaveLength(25);expect(capacityUsed(b,'player')).toBe(5);
    const group=b.fighters[0].groupId;b.fighters=b.fighters.filter((f,i)=>f.groupId!==group||i===0);expect(capacityUsed(b,'player')).toBe(5);
    b.fighters=b.fighters.filter(f=>f.groupId!==group);expect(capacityUsed(b,'player')).toBe(4);
    b=advanceBattle(b,1500);expect(capacityUsed(b,'player')).toBe(32);expect(b.fighters).toHaveLength(160);
  });
});

it('researches doctrine tradeoffs while retaining earned Gold as the lifetime score', () => {
  let s=newKingdom();s.castle=2;s.gold=s.lifetimeGold=100;s.buildings.barracks=1;
  s.tokens['Mathematics & Logic']=30;s.tokens['Computer Science']=30;
  s.units.a={unitId:'militia',investedXP:0,locked:false};s.armySlots[0]='a';
  const original=createBattle(s).config.slots[0]!;
  expect(()=>applyAction(s,{type:'doctrine',id:'shield-wall'})).toThrow(/Research/);
  s=applyAction(s,{type:'building',id:'academy'});
  expect(s.gold).toBe(70);expect(s.lifetimeGold).toBe(100);
  s=applyAction(s,{type:'doctrine',id:'shield-wall'});
  const shield=createBattle(s).config.slots[0]!;
  expect(shield.armor).toBeCloseTo((original.armor??0)+.1);expect(shield.speed).toBeCloseTo(original.speed*.8);
  expect(()=>applyAction(s,{type:'doctrine',id:'rapid-reserves'})).toThrow(/Research/);
  s=applyAction(s,{type:'building',id:'academy'});
  s=applyAction(s,{type:'doctrine',id:'rapid-reserves'});
  const rapid=createBattle(s).config.slots[0]!;
  expect(rapid.hp).toBe(Math.round(original.hp*.9));expect(rapid.spawnInterval).toBeCloseTo(original.spawnInterval*.85);
  expect(s.gold).toBe(10);expect(s.lifetimeGold).toBe(100);
});
