// Real PostgreSQL SQL/PLpgSQL and RLS, isolated in PGlite (no production connection).
// Vault cryptography is a platform concern: only its interface is stubbed here.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
let client;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (!['localhost','127.0.0.1','::1','[::1]'].includes(target.hostname)) throw new Error('Tests only accept a disposable local PostgreSQL database.');
  client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  if ((await client.query("SELECT to_regclass('auth.users') AS existing")).rows[0].existing) throw new Error('Refusing to test against an existing Supabase database. Use an empty disposable database.');
}
const db = client ? { query: (...args) => client.query(...args), exec: sql => client.query(sql), close: () => client.end() } : new PGlite();
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const rpc = (name, ...args) => scalar(`SELECT public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')})`, args);
const denied = async (sql, args = []) => {
  await assert.rejects(db.query(sql,args), /permission denied|row-level security/); checks++;
};
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE SCHEMA vault; CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),secret text,name text,description text);
    CREATE VIEW vault.decrypted_secrets AS SELECT id,secret AS decrypted_secret FROM vault.secrets;
    CREATE FUNCTION vault.create_secret(text,text,text) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE result uuid; BEGIN INSERT INTO vault.secrets(secret,name,description) VALUES($1,$2,$3) RETURNING id INTO result; RETURN result; END $$;
    CREATE FUNCTION vault.update_secret(uuid,text,text,text) RETURNS void LANGUAGE sql AS $$
      UPDATE vault.secrets SET secret=$2,name=$3,description=$4 WHERE id=$1;
    $$;
  `);
  for (const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    const sql = readFileSync('supabase/migrations/'+file,'utf8').replace(/CREATE EXTENSION IF NOT EXISTS[^;]+;/g,'');
    try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }); }
  }
  const a=randomUUID(), b=randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[a,b]);
  check((await rpc('kingdom_snapshot',a)).state.gold,0);
  const question = { topic:'Physics',subtopic:'Motion',angle:'Why',angle_fit:'Cause',question_text:'Why does force accelerate matter?',
    options:['A','B','C','D'],correct_index:0,explanation:'A is correct.',suggested_questions:[],concept:'Force',concept_definition:'Force',
    reasoning_complexity:'directInference',is_boss_question:false,required_concepts:[] };
  const reserved=await rpc('begin_question_generation',a);
  await assert.rejects(rpc('begin_question_generation',a),/being generated/); checks++;
  const q=await rpc('finish_question_generation',a,reserved.lease,reserved.generation,question);
  check((await rpc('begin_question_generation',a)).active.id,q.id);

  // A topic switch reserves a replacement without losing the old question on failure.
  const switching = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [switching]);
  const lifeLease = await rpc('begin_question_generation', switching, 'Life');
  const life = await rpc('finish_question_generation', switching, lifeLease.lease, lifeLease.generation,
    { ...question, topic: 'Life', question_text: 'Why do organisms lack wheels?' });
  check((await rpc('begin_question_generation', switching, 'Life')).active.id, life.id);
  const mathLease = await rpc('begin_question_generation', switching, 'Mathematics & Logic');
  check(mathLease.active, undefined);
  await assert.rejects(rpc('begin_question_generation', switching, 'Mathematics & Logic'), /being generated/); checks++;
  await rpc('cancel_question_generation', switching, mathLease.lease);
  check((await rpc('begin_question_generation', switching, 'Life')).active.id, life.id);
  const replacement = await rpc('begin_question_generation', switching, 'Mathematics & Logic');
  const math = await rpc('finish_question_generation', switching, replacement.lease, replacement.generation,
    { ...question, topic: 'Mathematics & Logic', question_text: 'Why does adding equal values preserve equality?' });
  check((await rpc('begin_question_generation', switching, 'Mathematics & Logic')).active.id, math.id);
  await assert.rejects(rpc('record_question_answer', switching, life.id, 0), /expired/); checks++;
  const backToLife = await rpc('begin_question_generation', switching, 'Life');
  check(backToLife.active, undefined);
  await rpc('cancel_question_generation', switching, backToLife.lease);
  check((await rpc('record_question_answer', switching, math.id, 0)).kingdom.state.tokens['Mathematics & Logic'], 0);
  check((await rpc('collect_learning_reward', switching, math.id)).state.tokens['Mathematics & Logic'], 10);
  // Recover an already-cached biology question whose badge incorrectly says math.
  await db.query(`INSERT INTO public.concepts(user_id,canonical_name,definition,aliases,topics)
    VALUES($1,'Biological Locomotion Constraints','Movement constraints','["Locomotion"]','{"Life":1}')`, [switching]);
  const badLease = await rpc('begin_question_generation', switching, 'Mathematics & Logic');
  await rpc('finish_question_generation', switching, badLease.lease, badLease.generation,
    { ...question, topic: 'Mathematics & Logic', concept: 'Locomotion' });
  const repair = await rpc('begin_question_generation', switching, 'Mathematics & Logic');
  check(repair.active, undefined);
  await rpc('cancel_question_generation', switching, repair.lease);
  await db.query('DELETE FROM auth.users WHERE id=$1', [switching]);

  // Remove caller-side filters: RLS still limits rows and blocks answer secrets.
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[a]);
  await db.exec('SET ROLE authenticated');
  check(Number(await scalar('SELECT count(*) FROM public.kingdom_state')),1);
  await denied('SELECT * FROM public.questions');
  await denied('SELECT issuance_lease FROM public.kingdom_state');
  await denied('SELECT * FROM public.learning_reward_events');
  for (const table of ['kingdom_state','questions','concepts','chat_messages','game_stats']) {
    await denied(`DELETE FROM public.${table}`);
    await denied(`INSERT INTO public.${table} DEFAULT VALUES`);
  }
  await denied("UPDATE public.kingdom_state SET state='{}'");
  await denied('SELECT public.record_question_answer($1,$2,0)',[a,q.id]);
  await denied('SELECT public.collect_learning_reward($1,$2)',[a,q.id]);
  await denied('SELECT public.pending_learning_reward($1)',[a]);
  await denied('SELECT public.score_question_internal($1,$2,0)',[a,q.id]);
  await denied('SELECT public.get_user_gemini_key($1)',[a]);
  check(await rpc('get_question_history'),[]);
  await db.exec('RESET ROLE');

  await assert.rejects(rpc('record_question_answer',b,q.id,0),/not found/); checks++;
  const first=await rpc('record_question_answer',a,q.id,0);
  check(first.kingdom.state.tokens.Physics,0);
  check(first.collected,false);
  check((await rpc('pending_learning_reward',a)).id,q.id);
  await assert.rejects(rpc('begin_question_generation',a),/Collect your Resources/); checks++;
  await assert.rejects(rpc('delete_learning_question',a,q.id),/Collect your Resources/); checks++;
  await assert.rejects(rpc('collect_learning_reward',b,q.id),/not found/); checks++;
  check((await rpc('kingdom_snapshot',a)).state.tokens.Physics,0);
  const retry=await rpc('record_question_answer',a,q.id,0);
  check(retry.kingdom.state.tokens.Physics,0);
  check((await rpc('collect_learning_reward',a,q.id)).state.tokens.Physics,10);
  check((await rpc('collect_learning_reward',a,q.id)).state.tokens.Physics,10);
  check(await rpc('pending_learning_reward',a),null);
  check((await rpc('record_question_answer',a,q.id,0)).collected,true);
  // Incorrect answers remain collectable even after question expiry; reset retires pending rewards.
  const pendingUser = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [pendingUser]);
  const pendingLease = await rpc('begin_question_generation', pendingUser);
  const pendingQuestion = await rpc('finish_question_generation', pendingUser, pendingLease.lease, pendingLease.generation, question);
  check((await rpc('record_question_answer', pendingUser, pendingQuestion.id, 1)).kingdom.state.tokens.Physics, 0);
  await db.query("UPDATE public.questions SET expires_at=now()-interval '1 minute' WHERE id=$1", [pendingQuestion.id]);
  check((await rpc('collect_learning_reward', pendingUser, pendingQuestion.id)).state.tokens.Physics, 3);
  const resetLease = await rpc('begin_question_generation', pendingUser);
  const resetQuestion = await rpc('finish_question_generation', pendingUser, resetLease.lease, resetLease.generation, question);
  await rpc('record_question_answer', pendingUser, resetQuestion.id, 0);
  await rpc('reset_learning_progress', pendingUser, 0);
  check(await rpc('pending_learning_reward', pendingUser), null);
  await assert.rejects(rpc('collect_learning_reward', pendingUser, resetQuestion.id), /reset/); checks++;
  check((await rpc('kingdom_snapshot', pendingUser)).state.tokens.Physics, 0);
  await db.query('DELETE FROM auth.users WHERE id=$1', [pendingUser]);
  check(first.reward,retry.reward);
  await assert.rejects(rpc('record_question_answer',a,q.id,1),/different selection/); checks++;
  check(Number(await scalar('SELECT count(*) FROM public.learning_reward_events')),1);
  check(Number(await scalar("SELECT reasoning_track->>'directInference' FROM public.concepts WHERE user_id=$1",[a])),1);

  const context=await rpc('kingdom_command_context',a,0);
  const building={type:'building',id:'barracks'};
  await assert.rejects(rpc('commit_kingdom_command',a,0,context.revision,randomUUID(),{type:'exchange',topic:'Physics'},context.state,null),/Invalid Castle command/); checks++;
  check(first.kingdom.state.gold,0);
  const next=structuredClone(context.state); next.buildings.barracks=1; next.tokens.Physics=0;
  const requestId=randomUUID();
  const result=await rpc('commit_kingdom_command',a,0,context.revision,requestId,building,next,null);
  check(result.state.buildings.barracks,1);
  check((await rpc('commit_kingdom_command',a,0,context.revision,requestId,building,next,null)).state.buildings.barracks,1);
  check(await rpc('commit_kingdom_command',a,0,context.revision,randomUUID(),building,next,null),null);
  await assert.rejects(rpc('find_kingdom_command',a,requestId,0,{type:'castle'}),/already used/); checks++;

  await rpc('delete_learning_question',a,q.id);
  check(Number(await scalar('SELECT count(*) FROM public.learning_reward_events')),1);
  const inFlight=await rpc('begin_question_generation',a);
  const reset=await rpc('reset_learning_progress',a,0);
  check(reset.kingdom.state.gold,0); check(reset.kingdom.generation,1);
  await assert.rejects(rpc('finish_question_generation',a,inFlight.lease,0,question),/reset/); checks++;
  await assert.rejects(rpc('kingdom_command_context',a,0),/reset/); checks++;
  await assert.rejects(rpc('commit_kingdom_command',a,0,result.revision,randomUUID(),building,next,null),/reset/); checks++;
  check((await rpc('reset_learning_progress',a,0)).kingdom.generation,1);
  check(Number(await scalar('SELECT count(*) FROM public.learning_reward_events')),1);

  // Browser-authored/legacy rows, even with an answer key, cannot earn.
  const old=await scalar(`INSERT INTO public.questions(user_id,topic,question_text,options,correct_index,explanation)
    VALUES($1,'Physics','Legacy','["A","B","C","D"]',0,'A') RETURNING id`,[a]);
  await assert.rejects(rpc('record_question_answer',a,old,0),/expired/); checks++;

  await db.exec('SET ROLE anon');
  await denied('SELECT state FROM public.kingdom_state');
  await denied('SELECT public.get_question_history()');
  await denied('CREATE TABLE public.cheat(id int)');
  await db.exec('RESET ROLE');
  check(await scalar("SELECT has_function_privilege('authenticated','public.commit_kingdom_command(uuid,bigint,bigint,uuid,jsonb,jsonb,timestamptz)','EXECUTE')"),false);
  check(Number(await scalar(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND (NOT c.relrowsecurity
      OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE')
      OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))`)),0);
  check(Number(await scalar(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proname<>'get_question_history'
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))`)),0);
  await db.exec('CREATE FUNCTION public.future_private_function() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$SELECT 1$$; CREATE SEQUENCE public.future_private_sequence;');
  check(await scalar("SELECT has_function_privilege('authenticated','public.future_private_function()','EXECUTE')"),false);
  check(await scalar("SELECT has_sequence_privilege('authenticated','public.future_private_sequence','USAGE')"),false);
  if (databaseUrl) {
    // Separate real connections exercise the account/question row locks, not mocks.
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });
    try {
      const lease = await rpc('begin_question_generation', b);
      const issued = await rpc('finish_question_generation', b, lease.lease, lease.generation, question);
      const calls = await Promise.all(Array.from({length:4}, () => pool.query('SELECT public.record_question_answer($1,$2,0) AS result',[b,issued.id])));
      for (const call of calls) check(call.rows[0].result.kingdom.state.tokens.Physics,0);
      const collections = await Promise.all(Array.from({length:4}, () => pool.query('SELECT public.collect_learning_reward($1,$2) AS result',[b,issued.id])));
      for (const call of collections) check(call.rows[0].result.state.tokens.Physics,10);
      const before = await rpc('kingdom_command_context',b,0);
      const state=structuredClone(before.state); state.tokens.Physics=0; state.buildings.barracks=1;
      const spends = await Promise.all(Array.from({length:4}, () => pool.query(
        'SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL) AS result',
        [b,before.revision,randomUUID(),building,state])));
      check(spends.filter(result=>result.rows[0].result!==null).length,1);
      check((await rpc('kingdom_snapshot',b)).state.buildings.barracks,1);
    } finally { await pool.end(); }
  }
  console.log(`${checks} database security and transaction checks passed; all migrations applied in isolated PostgreSQL.`);
} finally { await db.close(); }
