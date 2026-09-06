import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { game as g } from './load-game.mjs';
export async function testUnitCollection({db,rpc,check}) {
  const user=randomUUID(),other=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1),($2)',[user,other]);
  let s=g.newKingdom();s.tokens.Physics=100;s=g.applyAction(s,{type:'building',id:'barracks'});
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
  const recruited=await commit(command,id);check(Object.keys(recruited.state.units).length,3);check(recruited.state.tokens.Physics,75);check(recruited.result.recruits.length,3);
  check(await commit(command,id),recruited);
  // A later commit doesn't replace the original receipt's reveal.
  await commit(command);const recovered=await commit(command,id);check(recovered.result,recruited.result);check(recovered.state.recruitCount.barracks,2);
  const [recipient,...donors]=Object.keys(recruited.state.units);
  let current=(await rpc('kingdom_snapshot',user)).state;
  const merge={type:'merge',recipient,donors,expected:g.mergeFingerprint(current,recipient,donors)};
  const mergeId=randomUUID(),merged=await commit(merge,mergeId);check(merged.state.units[recipient].investedXP,20);check(merged.result.level,2);check(await commit(merge,mergeId),merged);
  await assert.rejects(commit(merge),/changed|donor/i);
  check((await rpc('kingdom_snapshot',other)).state.units,{});
  for(const type of ['unit-unlock','unit-star','unit-level'])await assert.rejects(rpc('commit_kingdom_command',user,0,merged.revision,randomUUID(),{type,id:'militia',expected:1},merged.state,null),/Invalid/);
  current=(await rpc('kingdom_snapshot',user)).state;
  const malformed={...current,armySlots:[recipient,recipient,null,null,null]};await assert.rejects(rpc('commit_kingdom_command',user,0,merged.revision,randomUUID(),{type:'army',slots:malformed.armySlots},malformed,null),/Invalid/);
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
  const initial=g.newKingdom();initial.buildings.barracks=1;initial.tokens.Physics=30;
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
  check(retried.state.tokens.Physics,0);check(Object.keys(retried.state.units).length,6);check(retried.state.recruitCount.barracks,2);
  const duplicate=await Promise.all([commit(ids[loser],proposals[loser],c.revision),commit(ids[loser],proposals[loser],c.revision)]);check(duplicate[0],duplicate[1]);
  const roster=Object.keys(retried.state.units),recipient=roster[0],donors=roster.slice(1,3);
  const merge={type:'merge',recipient,donors,expected:g.mergeFingerprint(retried.state,recipient,donors)};
  const next=g.applyAction(retried.state,merge,{requestId:randomUUID(),draws:[]});
  const merges=await Promise.all([commit(randomUUID(),next,retried.revision,merge),commit(randomUUID(),next,retried.revision,merge)]);check(merges.filter(Boolean).length,1);
  const now=await rpc('kingdom_snapshot',user);check(now.state.units[recipient].investedXP,20);check(Object.keys(now.state.units).length,4);assert.throws(()=>g.applyAction(now.state,merge),/changed/);
  await db.query('DELETE FROM auth.users WHERE id=$1',[user]);
}
