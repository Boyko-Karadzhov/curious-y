import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { game as g } from './load-game.mjs';
export async function testUnitCollection({db,rpc,check}) {
  const user=randomUUID(),other=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[user,other]);
  let s=g.newKingdom();s.tokens.Life=100;s.tokens['Earth & Space']=100;s=g.applyAction(s,{type:'building',id:'barracks'});
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1',[user,s]);
  const commit=async (command,id=randomUUID())=>{
    const prior=await rpc('find_kingdom_command',user,id,0,command);if(prior)return prior;
    const reserved=await rpc('reserve_kingdom_command',user,id,0,command);
    const c=await rpc('kingdom_command_context',user,0);
    const next=g.applyAction(g.parseKingdom(JSON.stringify(c.state)),command,{requestId:id,draws:reserved.draws});
    return rpc('commit_kingdom_command',user,0,c.revision,id,command,next,null);
  };
  const id=randomUUID(),command={type:'recruit',id:'barracks'};
  const draws=await rpc('reserve_kingdom_command',user,id,0,command);check(await rpc('reserve_kingdom_command',user,id,0,command),draws);
  const recruited=await commit(command,id);check(Object.keys(recruited.state.units).length,3);check(recruited.state.tokens.Life,87);check(recruited.result.recruits.length,3);
  check(await commit(command,id),recruited);
  // A later commit doesn't replace the original receipt's reveal.
  await commit(command);const recovered=await commit(command,id);check(recovered.result,recruited.result);check(recovered.state.recruitCount.barracks,2);
  const [recipient]=Object.keys(recruited.state.units);
  const current=await rpc('kingdom_snapshot',user);
  check(current.state.units[recipient].investedXP,0);check(Object.keys(current.state.units).length,6);
  check((await rpc('kingdom_snapshot',other)).state.units,{});
  for(const type of ['unit-unlock','unit-star','unit-level'])await assert.rejects(rpc('commit_kingdom_command',user,0,current.revision,randomUUID(),{type,id:'militia',expected:1},current.state,null),/Invalid/);
  const malformed={...current.state,armySlots:[recipient,recipient,null,null,null]};await assert.rejects(rpc('commit_kingdom_command',user,0,current.revision,randomUUID(),{type:'army',slots:malformed.armySlots},malformed,null),/Invalid/);
  const duplicateClass={...current.state,units:{...current.state.units,duplicate:{unitId:'spearman',investedXP:0,locked:false}}};
  check(await rpc('valid_recruitment_state',duplicateClass),true);
  for(const role of ['anon','authenticated']){
    const result=await db.query(`SELECT has_function_privilege($1,'public.reserve_kingdom_command(uuid,uuid,bigint,jsonb)','EXECUTE') AS permitted`,[role]);check(result.rows[0].permitted,false);
  }
  await rpc('reset_learning_progress',user,0);
  await assert.rejects(rpc('reserve_kingdom_command',user,id,0,command),/reset/);
  await assert.rejects(commit(command,id),/reset/);
  check((await rpc('kingdom_snapshot',user)).state.units,{});
  await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)',[user,other]);
}
export async function testUnitRaces({db,pool,rpc,check}) {
  const user=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);
  const initial=g.newKingdom();initial.buildings.barracks=1;initial.tokens.Life=16;initial.tokens['Earth & Space']=16;
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1',[user,initial]);
  const command={type:'recruit',id:'barracks'},ids=[randomUUID(),randomUUID()];
  const reservations=await Promise.all(ids.map(id=>rpc('reserve_kingdom_command',user,id,0,command)));
  const c=await rpc('kingdom_command_context',user,0);
  const proposals=ids.map((id,i)=>g.applyAction(c.state,command,{requestId:id,draws:reservations[i].draws}));
  const commit=(id,state,revision,cmd=command)=>pool ? pool.query('SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL) AS result',[user,revision,id,cmd,state]).then(r=>r.rows[0].result) : rpc('commit_kingdom_command',user,0,revision,id,cmd,state,null);
  const raced=await Promise.all(ids.map((id,i)=>commit(id,proposals[i],c.revision)));check(raced.filter(Boolean).length,1);
  const loser=raced[0]?1:0;check(await rpc('reserve_kingdom_command',user,ids[loser],0,command),reservations[loser]);
  const fresh=await rpc('kingdom_command_context',user,0);
  const retried=await commit(ids[loser],g.applyAction(fresh.state,command,{requestId:ids[loser],draws:reservations[loser].draws}),fresh.revision);
  check(retried.state.tokens.Life,0);check(Object.keys(retried.state.units).length,6);check(retried.state.recruitCount.barracks,2);
  const duplicate=await Promise.all([commit(ids[loser],proposals[loser],c.revision),commit(ids[loser],proposals[loser],c.revision)]);check(duplicate[0],duplicate[1]);
  check(Object.values(retried.state.units)[0].investedXP,0);
  await db.query('DELETE FROM auth.users WHERE id=$1',[user]);
}
