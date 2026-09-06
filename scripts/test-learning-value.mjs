import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Run the actual Demo calculator against PostgreSQL, including rounding and allocation.
const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = file => ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const resources = dataModule(compile('supabase/functions/_shared/resources.ts'));
const tuning = JSON.parse(readFileSync('supabase/functions/_shared/learning-value-tuning.json','utf8'));
const shared = compile('supabase/functions/_shared/learningValue.ts')
  .replace(/import tuning[^;]+;/, `const tuning = ${JSON.stringify(tuning)};`)
  .replace("'./resources.ts'", JSON.stringify(resources));
const {createLearningValueReward} = await import(dataModule(shared));
const now = '2026-09-06T12:00:00.000Z';
const base = {canonicalConcept:'Force',metadataKnown:true,preMastery:'learning',atomic:false,successes:1,
  axisSuccesses:0,nextDueAt:null,reasoning:'directInference',boss:false,lowValueAttempts:0,answeredAt:now};
const weights = {Physics:.7,'Mathematics & Logic':.2,'Earth & Space':.1};
const question = {topic:'Physics',question_text:'Why does force change motion?',options:['a','b','c','d'],correct_index:0,
  explanation:'Force',concept:'Force',concept_definition:'Force',reasoning_complexity:'directInference',is_boss_question:false,
  required_concepts:[],suggested_questions:[],topic_weights:weights};
async function issue(rpc,user,extra={}) {
  const lease = await rpc('begin_question_generation',user,'Physics');
  return rpc('finish_question_generation',user,lease.lease,lease.generation,{...question,...extra});
}
export async function testLearningValue({db,rpc,check,scalar}) {
  check(await rpc('learning_value_tuning'),tuning);
  for (const reasoning of Object.keys(tuning.reasoning)) for (const correct of [true,false]) {
    for (const state of [{},{successes:0},{preMastery:'mastered'},{axisSuccesses:3},{nextDueAt:now},
      {nextDueAt:'2026-09-06T12:00:00.001Z',preMastery:'mastered'},{atomic:true,successes:0},
      {metadataKnown:false,boss:true,successes:0},{boss:true},{boss:true,successes:0},
      {preMastery:'mastered',boss:true,lowValueAttempts:1},{lowValueAttempts:2},{lowValueAttempts:3}]) {
      const input = {...base,...state,reasoning};
      const sql = await rpc('learning_value_score',correct,input);
      const local = createLearningValueReward('q',correct,weights,'Physics',input);
      check(sql.total,local.totalKnowledge);
      check(sql.calculation.factors,local.calculation.factors);
      check(sql.calculation.limits,local.calculation.limits);
      check(sql.calculation.firstSuccess,local.calculation.firstSuccess);
      check(sql.calculation.due,local.calculation.due);
      check(await rpc('allocate_resources',sql.total,weights,'Physics'),local.lines);
    }
  }
  const user=randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)',[user]);
  await db.query(`INSERT INTO public.concepts(user_id,canonical_name,definition,aliases,topics)
    VALUES($1,'Force','Force','["push"]','{"Physics":1}')`,[user]);
  let q=await issue(rpc,user,{concept:' PUSH '});
  const first=await rpc('record_question_answer',user,q.id,0);
  check(first.reward.totalKnowledge,25); check(first.reward.calculation.firstSuccess,true);
  check(first.reward.calculation.inputs.canonicalConcept,'Force');
  check(first.question.reward,first.reward);
  const originalTuning = await scalar("SELECT pg_get_functiondef('public.learning_value_tuning()'::regprocedure)");
  try {
    await db.exec(`CREATE OR REPLACE FUNCTION public.learning_value_tuning() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '${JSON.stringify({...tuning,version:'test-v2',base:999})}'::jsonb $$`);
    check((await rpc('record_question_answer',user,q.id,0)).reward,first.reward);
    check((await rpc('pending_learning_reward',user)).reward,first.reward);
    check((await rpc('collect_learning_reward',user,q.id)).reward,first.reward);
  } finally { await db.exec(originalTuning); }
  check((await rpc('record_question_answer',user,q.id,0)).reward,first.reward);
  check(await rpc('pending_learning_reward',user),null);
  check(await scalar('SELECT reward_attempts FROM public.concepts WHERE user_id=$1',[user]),1);
  check(await scalar('SELECT reward_successes FROM public.concepts WHERE user_id=$1',[user]),1);
  check(Number(await scalar('SELECT extract(epoch FROM next_due_at-last_success_at) FROM public.concepts WHERE user_id=$1',[user])),86400);
  await rpc('collect_learning_reward',user,q.id);
  // Alias on a separately issued question does not earn novelty again.
  q=await issue(rpc,user,{concept:'push'});
  check((await rpc('record_question_answer',user,q.id,0)).reward.totalKnowledge,20);
  await rpc('collect_learning_reward',user,q.id);
  await db.query(`UPDATE public.concepts SET mastery='proficient',reasoning_track='{"directInference":3,"composition":3,"discrimination":3,"transfer":3,"counterfactual":3,"synthesis":3,"derivation":2}' WHERE user_id=$1`,[user]);
  q=await issue(rpc,user,{reasoning_complexity:'derivation'});
  const milestone=await rpc('record_question_answer',user,q.id,0);
  check(milestone.reward.totalKnowledge,35);
  check(milestone.reward.calculation.inputs.preMastery,'proficient');
  check(await scalar('SELECT mastery FROM public.concepts WHERE user_id=$1',[user]),'mastered');
  await rpc('collect_learning_reward',user,q.id);
  // Existing mastery and lastAsked do not establish a due review.
  await db.query("UPDATE public.concepts SET mastery='mastered',last_asked=now()-interval '1 year',next_due_at=NULL WHERE user_id=$1",[user]);
  q=await issue(rpc,user);
  const mastered=await rpc('record_question_answer',user,q.id,0);
  check(mastered.reward.totalKnowledge,6); check(mastered.reward.calculation.firstSuccess,false);
  await rpc('collect_learning_reward',user,q.id);
  // Successful early practice initializes a schedule, without earning a due bonus.
  for (const [step,days] of [[0,3],[1,7],[2,14],[3,30],[4,30]]) {
    await db.query("UPDATE public.concepts SET mastery='mastered',review_step=$2,next_due_at=clock_timestamp()-interval '1 second' WHERE user_id=$1",[user,step]);
    q=await issue(rpc,user);
    const review=await rpc('record_question_answer',user,q.id,0);
    check(review.reward.totalKnowledge,24); check(review.reward.calculation.due,true);
    check(Number(await scalar('SELECT extract(epoch FROM next_due_at-last_success_at) FROM public.concepts WHERE user_id=$1',[user])),days*86400);
    await rpc('collect_learning_reward',user,q.id);
  }
  // Review failure records an attempt, preserves success history, resets to a one-day retry.
  await db.query("UPDATE public.concepts SET review_step=4,next_due_at=clock_timestamp()-interval '1 second' WHERE user_id=$1",[user]);
  const successes=await scalar('SELECT reward_successes FROM public.concepts WHERE user_id=$1',[user]);
  q=await issue(rpc,user);
  const failed=await rpc('record_question_answer',user,q.id,1);
  check(failed.reward.calculation.due,true); check(failed.reward.calculation.factors.boss,1);
  check(await scalar('SELECT reward_successes FROM public.concepts WHERE user_id=$1',[user]),successes);
  check(Number(await scalar('SELECT extract(epoch FROM next_due_at-last_attempt_at) FROM public.concepts WHERE user_id=$1',[user])),86400);
  check(await scalar('SELECT review_step FROM public.concepts WHERE user_id=$1',[user]),0);
  await rpc('collect_learning_reward',user,q.id);
  // A reset cannot recover old receipts and resets the daily budget via generation.
  const generation=(await rpc('kingdom_snapshot',user)).generation;
  await rpc('reset_learning_progress',user,generation);
  await assert.rejects(rpc('collect_learning_reward',user,q.id),/reset/);
  for (const [index,amount] of [4,2,1,0,0].entries()) {
    q=await issue(rpc,user,{concept:`Failure ${index}`});
    const r=await rpc('record_question_answer',user,q.id,1);
    check(r.reward.totalKnowledge,amount);
    check((await rpc('collect_learning_reward',user,q.id)).reward,r.reward);
  }
  check(Number(await scalar('SELECT count(*) FROM public.concepts WHERE user_id=$1 AND next_due_at IS NOT NULL',[user])),0);
  // UTC-day rollover restores only the bounded budget, not novelty.
  await db.query("UPDATE public.learning_reward_budget SET day=day-1 WHERE user_id=$1",[user]);
  q=await issue(rpc,user,{concept:'Failure 0'});
  check((await rpc('record_question_answer',user,q.id,1)).reward.totalKnowledge,4);
  await rpc('collect_learning_reward',user,q.id);
  // Atomic foundation is never an earned success or spaced-review milestone.
  await db.query("UPDATE public.concepts SET is_atomic=true,mastery='mastered' WHERE user_id=$1 AND canonical_name='Failure 0'",[user]);
  q=await issue(rpc,user,{concept:'Failure 0'});
  const atomic=await rpc('record_question_answer',user,q.id,0);
  check(atomic.reward.calculation.firstSuccess,false); check(atomic.reward.calculation.due,false);
  check(await scalar("SELECT reward_successes FROM public.concepts WHERE user_id=$1 AND canonical_name='Failure 0'",[user]),0);
  check(await scalar("SELECT next_due_at FROM public.concepts WHERE user_id=$1 AND canonical_name='Failure 0'",[user]),null);
  await rpc('collect_learning_reward',user,q.id);
  // Missing metadata: explicit conservative penalty, no novelty or boss credit.
  q=await issue(rpc,user,{concept:'Unknown metadata',concept_definition:null});
  const fallback=await rpc('record_question_answer',user,q.id,0);
  check(fallback.reward.calculation.inputs.metadataKnown,false);
  check(fallback.reward.calculation.firstSuccess,false);
  check(fallback.reward.totalKnowledge,2); // third low-value encounter today: round(6*.25)
  await rpc('collect_learning_reward',user,q.id);
  // Trusted boss metadata requires verified prerequisites. Correctness controls the multiplier.
  q=await issue(rpc,user,{concept:'Boss success',is_boss_question:true,reasoning_complexity:'derivation',required_concepts:['Failure 0']});
  const boss=await rpc('record_question_answer',user,q.id,0);
  check(boss.reward.totalKnowledge,175); check(boss.reward.calculation.factors.boss,4);
  await rpc('collect_learning_reward',user,q.id);
  q=await issue(rpc,user,{concept:'Boss failure',is_boss_question:true,reasoning_complexity:'derivation',required_concepts:['Failure 0']});
  const bossFailure=await rpc('record_question_answer',user,q.id,1);
  check(bossFailure.reward.totalKnowledge,0); check(bossFailure.reward.calculation.factors.boss,1);
  await rpc('collect_learning_reward',user,q.id);
  await db.query('DELETE FROM auth.users WHERE id=$1',[user]);
  const duplicateOwner=randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES ($1)',[duplicateOwner]);
  await db.query(`INSERT INTO public.concepts(user_id,canonical_name,definition,aliases,topics)
    VALUES($1,'Force','Force','["push"]','{"Physics":1}'),($1,'force','Force','[]','{"Physics":1}')`,[duplicateOwner]);
  const canonical=await issue(rpc,duplicateOwner,{concept:'push'});
  await rpc('record_question_answer',duplicateOwner,canonical.id,0);
  check((await db.query('SELECT canonical_name,reward_successes,reasoning_track FROM public.concepts WHERE user_id=$1 ORDER BY canonical_name COLLATE "C"',[duplicateOwner])).rows.map(c=>[c.canonical_name,c.reward_successes,c.reasoning_track.directInference]),[['Force',1,1],['force',0,0]]);
  await db.query('DELETE FROM auth.users WHERE id=$1',[duplicateOwner]);
}

export async function testLearningValueRaces({db,pool,rpc,check}) {
  const user=randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES ($1)',[user]);
  await db.query(`INSERT INTO public.concepts(user_id,canonical_name,definition,aliases,topics)
    VALUES($1,'Force','Force','["push"]','{"Physics":1}')`,[user]);
  const a=await issue(rpc,user,{concept:'push'});
  // A second historical outstanding issuance tests different IDs for one canonical concept.
  const b=(await db.query(`INSERT INTO public.questions(user_id,topic,question_text,options,correct_index,explanation,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights)
    SELECT user_id,topic,question_text,options,correct_index,explanation,'push',concept_definition,reasoning_complexity,
    is_boss_question,required_concepts,prerequisites_met,expires_at,trusted_issuance,generation,topic_weights
    FROM public.questions WHERE id=$1 RETURNING id`,[a.id])).rows[0];
  const calls=await Promise.allSettled([a,b,a,b].map(q=>pool.query('SELECT public.record_question_answer($1,$2,0) r',[user,q.id])));
  const successful=calls.filter(x=>x.status==='fulfilled').map(x=>x.value.rows[0].r);
  check(successful.length>=1,true);
  const winner=successful[0];
  for (const result of successful) check(result.reward,winner.reward);
  check((await db.query('SELECT reward_successes FROM public.concepts WHERE user_id=$1',[user])).rows[0].reward_successes,1);
  await rpc('collect_learning_reward',user,winner.reward.id);
  const loser=winner.reward.id===a.id?b:a;
  const second=await rpc('record_question_answer',user,loser.id,0);
  check(second.reward.calculation.firstSuccess,false); check(second.reward.totalKnowledge,20);
  check((await db.query('SELECT reward_successes FROM public.concepts WHERE user_id=$1',[user])).rows[0].reward_successes,2);
  await db.query('DELETE FROM auth.users WHERE id=$1',[user]);
}
