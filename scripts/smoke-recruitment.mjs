import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {game as g} from './load-game.mjs';
// Explicit release smoke: creates and deletes only its own temporary Auth user.
// Keys stay in memory and are never logged. --linked uses the authenticated CLI.
let url=process.env.SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(process.argv.includes('--linked')){
  const ref=readFileSync('supabase/.temp/project-ref','utf8').trim();
  const result=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys','--project-ref',ref,'--reveal','--output','json'],{encoding:'utf8'});
  if(result.status!==0)throw new Error('Could not load linked release credentials.');
  const keys=JSON.parse(result.stdout);anon=keys.find(k=>k.name==='anon')?.api_key;service=keys.find(k=>k.name==='service_role')?.api_key;url=`https://${ref}.supabase.co`;
}
assert(url&&anon&&service,'Supply release credentials or explicitly select --linked.');
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const unwrap=async promise=>{const {data,error}=await promise;if(error)throw new Error(error.message);return data;};
let userId;
try{
  const email=`recruitment-smoke-${randomUUID()}@example.com`,password=randomUUID()+randomUUID();
  const created=await unwrap(admin.auth.admin.createUser({email,password,email_confirm:true}));userId=created.user.id;
  const link=await unwrap(admin.auth.admin.generateLink({type:'magiclink',email}));
  const login=await unwrap(client.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}));
  const call=async(body,expected=200)=>{const response=await fetch(`${url}/functions/v1/learning`,{method:'POST',headers:{apikey:anon,authorization:`Bearer ${login.session.access_token}`,'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;};
  let snapshot=(await call({action:'kingdom'})).kingdom;assert.equal(snapshot.state.version,8);assert.deepEqual(snapshot.state.units,{});
  const generation=snapshot.generation;
  const command=async(command,requestId=randomUUID(),epoch=generation)=>{snapshot=(await call({action:'kingdom_command',command,requestId,generation:epoch})).kingdom;return snapshot;};
  const lease=await unwrap(admin.rpc('begin_question_generation',{p_user_id:userId,p_topic:'Physics'}));
  const q=await unwrap(admin.rpc('finish_question_generation',{p_user_id:userId,p_lease:lease.lease,p_generation:lease.generation,p_question:{topic:'Physics',subtopic:'Motion',angle:'Why',angle_fit:'Cause',question_text:'Why does an unbalanced force change motion?',options:['It produces acceleration.','It removes mass.','It stops time.','It removes all energy.'],correct_index:0,explanation:'A net force produces acceleration.',suggested_questions:[],concept:'Net force and acceleration',concept_definition:'Net force changes velocity.',topic_weights:{Physics:1},reasoning_complexity:'directInference',is_boss_question:false,required_concepts:[],prerequisites_met:true}}));
  await call({action:'answer',questionId:q.id,selectedIndex:0});await call({action:'collect_reward',questionId:q.id});
  snapshot=(await call({action:'kingdom'})).kingdom;assert.equal(snapshot.state.tokens.Physics,25);
  await command({type:'building',id:'barracks'});assert.deepEqual(snapshot.state.units,{});
  const recruitId=randomUUID(),recruit={type:'recruit',id:'barracks'};await command(recruit,recruitId);const reveal=snapshot.result;assert.equal(snapshot.state.tokens.Physics,0);assert.equal(Object.keys(snapshot.state.units).length,3);
  await command(recruit,recruitId);assert.deepEqual(snapshot.result,reveal);assert.equal(snapshot.state.recruitCount.barracks,1);
  const [recipient,...donors]=Object.keys(snapshot.state.units);const merge={type:'merge',recipient,donors,expected:g.mergeFingerprint(snapshot.state,recipient,donors)},mergeId=randomUUID();
  await command(merge,mergeId);assert.equal(snapshot.state.units[recipient].investedXP,20);assert.equal(snapshot.result.level,2);
  await command({type:'army',slots:[recipient,null,null,null,null]});await command(merge,mergeId);assert.equal(snapshot.state.armySlots[0],recipient);assert.equal(snapshot.result.level,2);
  await command(recruit,recruitId);assert.deepEqual(snapshot.result,reveal);assert.equal(Object.keys(snapshot.state.units).length,1);
  await command({type:'start',stage:1});assert.equal(snapshot.state.battle.config.rulesVersion,10);assert.equal(snapshot.state.battle.config.slots[0].hp,78);
  const reset=await call({action:'reset',generation});assert.deepEqual(reset.kingdom.state.units,{});
  await call({action:'kingdom_command',command:recruit,requestId:recruitId,generation},409);
  console.log('Live smoke passed: fresh account, real answer/collect (25 Force), build, recruit, duplicate recovery, merge, equip, rules-10 battle, reset and stale-generation rejection.');
} finally {
  if(userId){await unwrap(admin.auth.admin.deleteUser(userId));console.log('Temporary smoke account deleted.');}
}
