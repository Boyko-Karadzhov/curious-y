import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { game as g } from './load-game.mjs';
export async function testForge({db,rpc,check}) {
 const user=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await rpc('kingdom_snapshot',user);
 let s=g.newKingdom();s.castle=4;for(const t of g.TOPICS)s.tokens[t]=100;s=g.applyAction(s,{type:'building',id:'forge'});
 await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1',[user,s]);
 const action={type:'forge'},id=randomUUID(),draws=await rpc('reserve_kingdom_command',user,id,0,action);
 check(draws.draws.length,6);check(await rpc('reserve_kingdom_command',user,id,0,action),draws);
 const context=await rpc('kingdom_command_context',user,0);
 const next=g.applyAction(context.state,action,{requestId:id,draws:draws.draws});
 const result=await rpc('commit_kingdom_command',user,0,context.revision,id,action,next,null);
 check(result.state.forge.count,1);for(const t of g.TOPICS)check(result.state.tokens[t],88);
 check(await rpc('commit_kingdom_command',user,0,context.revision,id,action,next,null),result);
 check((await rpc('find_kingdom_command',user,id,0,action)).state.forge.pending,result.state.forge.pending);
 const proposed=g.applyAction(result.state,{type:'resolve-forge',itemId:id,choice:'equip'});
 const equipId=randomUUID(),cmd={type:'resolve-forge',itemId:id,choice:'equip'};
 const equipped=await rpc('commit_kingdom_command',user,0,result.revision,equipId,cmd,proposed,null);check(Object.keys(equipped.state.forge.equipped).length,1);
 for(const mutate of [x=>{x.forge.pending=Object.values(x.forge.equipped)[0];},x=>{x.forge.count=0;},x=>{Object.values(x.forge.equipped)[0].bonus.value=999;},x=>{x.forge.equipped['invalid:armor']=Object.values(x.forge.equipped)[0];},x=>{delete x.forge;}]){
  const bad=structuredClone(equipped.state);mutate(bad);await assert.rejects(rpc('commit_kingdom_command',user,0,equipped.revision,randomUUID(),action,bad,null),/Invalid/);
 }
 // Two tabs propose different decisions against the same revision; only one commits.
 const forgeId=randomUUID(),reserved=await rpc('reserve_kingdom_command',user,forgeId,0,action);
 const pending=g.applyAction(equipped.state,action,{requestId:forgeId,draws:reserved.draws});
 const forged=await rpc('commit_kingdom_command',user,0,equipped.revision,forgeId,action,pending,null);
 const choices=['equip','sell'].map(choice=>({type:'resolve-forge',itemId:forgeId,choice}));
 const decisions=await Promise.all(choices.map(command=>rpc('commit_kingdom_command',user,0,forged.revision,randomUUID(),command,g.applyAction(forged.state,command),null)));
 check(decisions.filter(Boolean).length,1);check((await rpc('kingdom_snapshot',user)).state.forge.pending,null);
 for(const role of ['anon','authenticated'])for(const name of ['valid_forged_item','valid_forge_state'])check((await db.query(`SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,[role,`public.${name}(jsonb)`])).rows[0].allowed,false);
 await rpc('reset_learning_progress',user,0);await assert.rejects(rpc('reserve_kingdom_command',user,id,0,action),/reset/);check((await rpc('kingdom_snapshot',user)).state.forge,g.emptyForge());
 await db.query('DELETE FROM auth.users WHERE id=$1',[user]);
}
