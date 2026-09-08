import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { game as g } from './load-game.mjs';

export async function testTerritory({db,rpc,check}) {
 const user=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);
 const state=g.newKingdom();state.cleared=3;
 await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1',[user,state]);
 const issue=async()=>{
  const lease=await rpc('begin_question_generation',user,'Life');
  return rpc('finish_question_generation',user,lease.lease,lease.generation,{topic:'Life',question_text:'Why does a cell need energy?',options:['Metabolism','No reason','Color','Gravity'],correct_index:0,explanation:'Metabolism uses energy.',concept:'Energy '+randomUUID(),concept_definition:'Energy for cellular work',reasoning_complexity:'directInference',is_boss_question:false,required_concepts:[],suggested_questions:[],topic_weights:{Life:1}});
 };
 let q=await issue();let result=await rpc('record_question_answer',user,q.id,1);
 check(result.kingdom.state.gold,0);check(result.kingdom.state.tribute.claimed,false);
 await rpc('collect_learning_reward',user,q.id);
 q=await issue();result=await rpc('record_question_answer',user,q.id,0);
 check(result.kingdom.state.gold,30);check(result.kingdom.state.lifetimeGold,30);check(result.kingdom.state.buildings.treasury,0);
 const replay=await rpc('record_question_answer',user,q.id,0);check(replay.kingdom,result.kingdom);
 const collected=await rpc('collect_learning_reward',user,q.id);check(collected.state.gold,30);
 q=await issue();result=await rpc('record_question_answer',user,q.id,0);check(result.kingdom.state.gold,30);
 await rpc('collect_learning_reward',user,q.id);
 // A prior-day claim cannot accumulate missing days; SQL and Demo share rules.
 const old={...result.kingdom.state,tribute:{day:'2020-01-01',territories:3,correct:true,claimed:true,paid:30}};
 const rollover=await rpc('apply_territory_tribute',old,'2026-09-08T00:00:00Z',null,true);
 check(rollover.gold,60);check(rollover.tribute.paid,30);
 const initial={...g.newKingdom(),tribute:{day:'2026-09-08',territories:0,correct:true,claimed:false,paid:0}};
 const first=await rpc('apply_territory_tribute',initial,'2026-09-08T12:00:00Z',1,false);
 check(first.gold,10);check(first.tribute.territories,1);
 const later=await rpc('apply_territory_tribute',{...first,cleared:1},'2026-09-08T12:01:00Z',2,false);
 check(later.gold,10);check(later.tribute.territories,1);
 const context=await rpc('kingdom_command_context',user,0);
 const fake={...context.state,tribute:{...context.state.tribute,paid:9999}};
 await assert.rejects(rpc('commit_kingdom_command',user,0,context.revision,randomUUID(),{type:'army',slots:fake.armySlots},fake,null),/Invalid/);
 for(const role of ['anon','authenticated'])for(const signature of ['public.credit_correct_answer_tribute()','public.apply_territory_tribute(jsonb,timestamptz,bigint,boolean)']) {
  check((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,signature])).rows[0].allowed,false);
 }
 await rpc('reset_learning_progress',user,0);check((await rpc('kingdom_snapshot',user)).state,g.newKingdom());
 await db.query('DELETE FROM auth.users WHERE id=$1',[user]);
}
