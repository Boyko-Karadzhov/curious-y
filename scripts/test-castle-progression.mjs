import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = path => ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const resources = moduleUrl(compile('supabase/functions/_shared/resources.ts'));
const units = moduleUrl(compile('supabase/functions/_shared/units.ts'));
const combat = moduleUrl(compile('supabase/functions/_shared/unitCombat.ts').replaceAll("'./units.ts'", JSON.stringify(units)));
const towers = moduleUrl(compile('supabase/functions/_shared/towers.ts').replaceAll("'./units.ts'", JSON.stringify(units)).replace("'./resources.ts'", JSON.stringify(resources)));
const kingdom = moduleUrl(compile('supabase/functions/_shared/kingdom.ts').replaceAll("'./units.ts'", JSON.stringify(units)).replace("'./unitCombat.ts'", JSON.stringify(combat)).replace("'./resources.ts'", JSON.stringify(resources)).replace("'./towers.ts'", JSON.stringify(towers)));
const { applyAction, newKingdom, parseKingdom, TOPICS } = await import(kingdom);
const { qualifyingConceptCount, reconcileLibrary } = await import(moduleUrl(compile('supabase/functions/_shared/library.ts').replace("'./kingdom.ts'", JSON.stringify(kingdom)).replace("'./resources.ts'", JSON.stringify(resources)).replace("'./towers.ts'", JSON.stringify(towers))));
const track = { directInference: 1, composition: 2, discrimination: 2, transfer: 3, counterfactual: 0, synthesis: 0, derivation: 0 };
const insertConcept = (db, user, name, mastery = 'proficient', aliases = [], atomic = false, reasoning = track) => db.query(`
  INSERT INTO public.concepts(user_id,canonical_name,definition,topics,mastery,aliases,is_atomic,reasoning_track)
  VALUES($1,$2,'Test concept','{"Physics":1}',$3,$4,$5,$6)`, [user, name, mastery, JSON.stringify(aliases), atomic, reasoning]);
const funded = () => ({ ...newKingdom(), castle: 5, gold: 1000, tokens: Object.fromEntries(TOPICS.map(t => [t, 1000])) });

export async function testUnitCollection({ db, rpc, check }) {
  const user = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  let initial = funded(); initial.buildings.barracks = 2; initial.cleared = 10;
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1', [user, initial]);
  const command = async (action, request = randomUUID()) => {
    const c = await rpc('kingdom_command_context', user, 0);
    const next = applyAction(parseKingdom(JSON.stringify(c.state)), action);
    return rpc('commit_kingdom_command', user, 0, c.revision, request, action, next, null);
  };
  let c = await command({ type:'unit-unlock',id:'spearman' });
  check(c.state.units.spearman.level,1);check(c.state.gold,1000);
  c = await command({ type:'unit-level',id:'spearman',expected:1 });check(c.state.gold,1000);
  await assert.rejects(command({ type:'unit-level',id:'spearman',expected:1 }),/changed/);
  c = await command({ type:'unit-star',id:'spearman',expected:1 });check(c.state.gold,1000);check(c.state.units.spearman.stars,2);
  for(const invalid of [{type:'unit-unlock',id:'fake'}, {type:'unit-level',id:'spearman',expected:1.5}]) {
    await assert.rejects(rpc('commit_kingdom_command',user,0,c.revision,randomUUID(),invalid,c.state,null),/Invalid/);
  }
  c = await command({type:'army',slots:['spearman',null,null,null]});
  c = await command({type:'start',stage:11});
  // Actual JSONB round trip must accept reordered ability object keys.
  check(parseKingdom(JSON.stringify(c.state)).battle.config.slots[0].ability.family,'counter');
  await assert.rejects(command({type:'unit-level',id:'spearman',expected:2}),/battle/);
  await rpc('reset_learning_progress',user,0); c = await rpc('kingdom_snapshot',user);
  check(c.state.units,{}); check(c.state.gold,0);
}

export async function testUnitRaces({ db, pool = db, rpc, check }) {
  const user=randomUUID();await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);
  const state=funded();state.buildings.barracks=2;state.cleared=10;
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1',[user,state]);
  const c=await rpc('kingdom_command_context',user,0), action={type:'unit-level',id:'swordsman',expected:1};
  const next=applyAction(parseKingdom(JSON.stringify(c.state)),action), id=randomUUID();
  const commit=request=>pool.query('SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL) AS result',[user,c.revision,request,action,next]);
  const duplicate=await Promise.all([commit(id),commit(id)]);check(duplicate[0].rows[0].result,duplicate[1].rows[0].result);
  const stale=await commit(randomUUID());check(stale.rows[0].result,null);
  const current=await rpc('kingdom_snapshot',user);check(current.state.gold,1000);check(current.state.units.swordsman.level,2);
  // Different valid purchases compete for the same last 30 Force.
  const limited={...current.state,gold:0,tokens:{...current.state.tokens,Physics:30}};await db.query('UPDATE public.kingdom_state SET state=$2,revision=revision+1 WHERE user_id=$1',[user,limited]);
  const latest=await rpc('kingdom_command_context',user,0);
  const actions=[{type:'unit-star',id:'swordsman',expected:1},{type:'building',id:'barracks'}];
  const race=await Promise.all(actions.map(a=>pool.query('SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL) AS result',[user,latest.revision,randomUUID(),a,applyAction(latest.state,a)])));
  check(race.filter(r=>r.rows[0].result!==null).length,1);check([0,15].includes((await rpc('kingdom_snapshot',user)).state.tokens.Physics),true);
}

export async function testCastleProgression({ db, rpc, check, scalar }) {
  const user = randomUUID(), other = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [user, other]);
  for (let i = 0; i < 9; i++) await insertConcept(db, user, `Concept ${i}`, 'proficient', i === 0 ? ['shared alias'] : []);
  const before = await rpc('kingdom_snapshot', user);
  check(before.state.libraryConcepts, 9); check(before.state.buildings.library, 0);
  await insertConcept(db, user, 'Target', 'learning', ['target alias'], false, { ...track, composition: 1 });
  const lease = await rpc('begin_question_generation', user, 'Physics');
  const q = await rpc('finish_question_generation', user, lease.lease, lease.generation, {
    topic: 'Physics', question_text: 'What follows?', options: ['a','b','c','d'], correct_index: 0,
    explanation: 'Reasoning', concept: 'target alias', concept_definition: 'Target', reasoning_complexity: 'composition',
    is_boss_question: false, required_concepts: [], suggested_questions: [], topic_weights: { Physics: 1 },
  });
  const answered = await rpc('record_question_answer', user, q.id, 0);
  check(answered.kingdom.state.libraryConcepts, 10); check(answered.kingdom.state.buildings.library, 1);
  check(answered.kingdom.state.gold, 0);
  const snapshot = await rpc('kingdom_snapshot', user);
  await rpc('record_question_answer', user, q.id, 0);
  await rpc('reconcile_library', user); await rpc('reconcile_library', user);
  check(await rpc('kingdom_snapshot', user), snapshot);
  await rpc('collect_learning_reward', user, q.id); await rpc('delete_learning_question', user, q.id);
  check((await rpc('kingdom_snapshot', user)).state.libraryConcepts, 10);
  for (let i = 10; i < 151; i++) {
    await insertConcept(db, user, `Concept ${i}`);
    if ([29,30,74,75,149,150,151].includes(i + 1)) {
      const s = (await rpc('kingdom_snapshot', user)).state;
      check(s.libraryConcepts, i + 1); check(s.buildings.library, [10,30,75,150].filter(n => i + 1 >= n).length);
    }
  }
  await insertConcept(db, user, ' SHARED   alias ', 'mastered', ['chain']);
  await insertConcept(db, user, 'Chain', 'mastered');
  await insertConcept(db, user, 'Atomic foundation', 'mastered', ['atomic alias'], true);
  await insertConcept(db, user, 'atomic alias', 'proficient');
  await insertConcept(db, user, 'No earned track', 'mastered', [], false, {});
  check((await rpc('kingdom_snapshot', user)).state.libraryConcepts, 151);
  const concepts = (await db.query('SELECT * FROM public.concepts WHERE user_id=$1', [user])).rows;
  check(await rpc('library_concept_count', user), qualifyingConceptCount(concepts.map(c => ({
    canonicalName: c.canonical_name, aliases: c.aliases, mastery: c.mastery, isAtomic: c.is_atomic, reasoningTrack: c.reasoning_track,
  }))));
  check((await rpc('kingdom_snapshot', other)).state.libraryConcepts, 0);
  check(await scalar("SELECT mastery FROM public.concepts WHERE user_id=$1 AND canonical_name='Atomic foundation'", [user]), 'mastered');
  for (const id of ['library', 'forge']) {
    await assert.rejects(rpc('set_progression_goal', user, { type: 'building', id, level: 1 }, 0), /Invalid/);
    const c = await rpc('kingdom_command_context', user, 0);
    await assert.rejects(rpc('commit_kingdom_command', user, 0, c.revision, randomUUID(), { type: 'building', id }, c.state, null), /Invalid/);
  }
  const initial = funded(); initial.buildings.barracks = 1; initial.buildings.treasury = 1;
  initial.armySlots = ['swordsman', null, null, null];
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1', [other, initial]);
  const command = async action => {
    const c = await rpc('kingdom_command_context', other, 0), id = randomUUID();
    const next = applyAction(parseKingdom(JSON.stringify(c.state)), action);
    const committed = await rpc('commit_kingdom_command', other, 0, c.revision, id, action, next, null);
    check(await rpc('commit_kingdom_command', other, 0, c.revision, id, action, next, null), committed);
    return committed;
  };
  await command({ type: 'start', stage: 1 });
  let c = await rpc('kingdom_command_context', other, 0), next = c.state;
  while (!next.battle.result) next = applyAction(next, { type: 'tick' });
  await rpc('commit_kingdom_command', other, 0, c.revision, randomUUID(), { type: 'tick' }, next, null);
  check(next.battle.result, 'victory');
  const upgraded = await command({ type: 'building', id: 'treasury' });
  check(upgraded.state.battle.config.reward.totalGold, 61);
  const paid = await command({ type: 'collect-battle', stage: 1 });
  check(paid.state.gold, upgraded.state.gold + 61); check(paid.state.battle.paidGold, 61);
  const again = await command({ type: 'collect-battle', stage: 1 }); check(again.state.gold, paid.state.gold);
  c = await rpc('kingdom_command_context', other, 0);
  await assert.rejects(rpc('commit_kingdom_command', other, 0, c.revision, randomUUID(), { type: 'tick' }, { ...c.state, libraryConcepts: 150 }, null), /Invalid/);
  await rpc('reset_learning_progress', user, 0);
  const reset = await rpc('kingdom_snapshot', user);
  check(reset.state, newKingdom()); check((await rpc('kingdom_snapshot', other)).state.gold, paid.state.gold);
  await rpc('reconcile_library', user); check(await rpc('kingdom_snapshot', user), reset);
  for (const role of ['anon', 'authenticated']) {
    check(await scalar(`SELECT has_function_privilege('${role}','public.reconcile_library(uuid)','EXECUTE')`), false);
    check(await scalar(`SELECT has_function_privilege('${role}','public.library_concept_count(uuid)','EXECUTE')`), false);
  }
  await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [user, other]);
}

export async function testCastleRaces({ db, pool, rpc, check }) {
  const user = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1)', [user]);
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1', [user, funded()]);
  const c = await rpc('kingdom_command_context', user, 0), action = { type: 'building', id: 'academy' };
  const next = applyAction(c.state, action), request = randomUUID();
  const commit = id => pool.query('SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL) AS result', [user, c.revision, id, action, next]);
  const raced = await Promise.all([commit(request), commit(request), commit(randomUUID()), commit(randomUUID())]);
  const final = await rpc('kingdom_snapshot', user);
  check(final.state.buildings.academy, 1); check(final.state.tokens.Life, 980); check(final.state.tokens['Mind & Behavior'], 980);
  check(final.revision, c.revision + 1);
  check(raced.filter(r => r.rows[0].result !== null).length >= 1, true);
  // A mastery crossing invalidates an in-flight purchase's revision instead of losing knowledge.
  const stale = await rpc('kingdom_command_context', user, 0);
  await insertConcept(db, user, 'Earned');
  const purchase = applyAction(stale.state, { type: 'building', id: 'treasury' });
  check(await rpc('commit_kingdom_command', user, 0, stale.revision, randomUUID(), { type: 'building', id: 'treasury' }, purchase, null), null);
  check((await rpc('kingdom_snapshot', user)).state.libraryConcepts, 1);
  // Collection racing a Treasury upgrade must retry against the same frozen reward.
  let battleState = { ...funded(), libraryConcepts: 1 };
  battleState.buildings.barracks = 1; battleState.buildings.treasury = 1;
  battleState.armySlots = ['swordsman', null, null, null];
  battleState = applyAction(battleState, { type: 'start', stage: 1 });
  while (!battleState.battle.result) battleState = applyAction(battleState, { type: 'tick' });
  check(battleState.battle.result, 'victory');
  await db.query('UPDATE public.kingdom_state SET state=$2,revision=revision+1 WHERE user_id=$1', [user, battleState]);
  const rewardContext = await rpc('kingdom_command_context', user, 0);
  const actions = [{ type: 'collect-battle', stage: 1 }, { type: 'building', id: 'treasury' }];
  const ids = actions.map(() => randomUUID());
  const results = await Promise.all(actions.map((action, i) => pool.query(
    'SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL) AS result',
    [user, rewardContext.revision, ids[i], action, applyAction(rewardContext.state, action)])));
  check(results.filter(r => r.rows[0].result !== null).length, 1);
  for (let i = 0; i < actions.length; i++) {
    const current = await rpc('kingdom_command_context', user, 0);
    const existing = await rpc('find_kingdom_command', user, ids[i], 0, actions[i]);
    if (!existing) await rpc('commit_kingdom_command', user, 0, current.revision, ids[i], actions[i], applyAction(current.state, actions[i]), null);
  }
  const paid = await rpc('kingdom_snapshot', user);
  check(paid.state.gold, battleState.gold - 20 + 61); check(paid.state.battle.paidGold, 61); check(paid.state.buildings.treasury, 2);
  const collect = { type: 'collect-battle', stage: 1 }, retryId = randomUUID();
  await Promise.all(Array.from({ length: 3 }, () => pool.query(
    'SELECT public.commit_kingdom_command($1,0,$2,$3,$4,$5,NULL)', [user, paid.revision, retryId, collect, applyAction(paid.state, collect)])));
  check((await rpc('kingdom_snapshot', user)).state.gold, paid.state.gold);
  await db.query('DELETE FROM auth.users WHERE id=$1', [user]);
}

export async function testKnowledgeTowers({ db, rpc, check, scalar }) {
  const user = randomUUID(), other = randomUUID(); await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [user, other]);
  const catalog = (await db.query('SELECT * FROM public.resource_topics() ORDER BY ord')).rows;
  for (const r of catalog) {
    await insertConcept(db, user, `Tower ${r.key}`);
    await db.query('UPDATE public.concepts SET topics=$3 WHERE user_id=$1 AND canonical_name=$2', [user, `Tower ${r.key}`, { [r.topic]: 1 }]);
  }
  let current = await rpc('kingdom_snapshot', user);
  check(Object.values(current.state.towers.points), Array(8).fill(1000000));
  for (const weights of [{ Physics: 7, Life: 2, Chemistry: 1 }, { Physics: 1, Life: 1, Chemistry: 1 },
    { Physics: 1e300, Life: 1e300 }, { Physics: 1e-300, Life: 1e-300 }, { Physics: -1, Life: 1 }, {}, { unknown: 1 }]) {
    const expected = reconcileLibrary(newKingdom(), [{ canonicalName: 'Allocation', topics: weights, aliases: [], mastery: 'proficient', reasoningTrack: track }]);
    check(await rpc('tower_contribution', weights), expected.towers.points);
  }
  await insertConcept(db, user, 'Alias', 'mastered', ['Tower force']);
  await insertConcept(db, user, 'Atomic', 'mastered', ['Tower essence'], true);
  await insertConcept(db, user, 'Assumed', 'mastered', [], false, {});
  current = await rpc('kingdom_snapshot', user);
  check(current.state.towers.points.force, 1000000); check(current.state.towers.points.essence, 0);
  check(current.state.libraryConcepts, 7);
  const compareDemo = async () => {
    const rows = (await db.query('SELECT * FROM public.concepts WHERE user_id=$1', [user])).rows;
    const demo = reconcileLibrary(newKingdom(), rows.map(c => ({ canonicalName: c.canonical_name, aliases: c.aliases,
      topics: c.topics, mastery: c.mastery, reasoningTrack: c.reasoning_track, isAtomic: c.is_atomic })));
    const live = (await rpc('kingdom_snapshot', user)).state;
    check(live.towers, demo.towers); check(live.libraryConcepts, demo.libraryConcepts);
  };
  await compareDemo();
  const setup = { ...current.state, gold: 100, castle: 2, tokens: Object.fromEntries(TOPICS.map(t => [t, 100])),
    buildings: { ...current.state.buildings, barracks: 1 }, armySlots: ['swordsman',null,null,null] };
  await db.query('UPDATE public.kingdom_state SET state=$2 WHERE user_id=$1', [user, setup]);
  let ctx = await rpc('kingdom_command_context', user, 0);
  const started = applyAction(parseKingdom(JSON.stringify(ctx.state)), { type: 'start', stage: 1 });
  await rpc('commit_kingdom_command', user, 0, ctx.revision, randomUUID(), { type: 'start', stage: 1 }, started, '2026-09-06T00:00:00Z');
  const frozen = started.battle;
  await db.query(`UPDATE public.concepts SET topics='{"Physics":1,"Life":1}' WHERE user_id=$1 AND canonical_name='Alias'`, [user]);
  current = await rpc('kingdom_snapshot', user); check(current.state.battle, frozen);
  check(current.state.towers.points.force, 500000); check(current.state.towers.points.essence, 500000);
  // A stale command cannot clobber newly reconciled knowledge or its revision.
  check(await rpc('commit_kingdom_command', user, 0, ctx.revision, randomUUID(), { type: 'tick' }, started, null), null);
  ctx = await rpc('kingdom_command_context', user, 0);
  await assert.rejects(rpc('commit_kingdom_command', user, 0, ctx.revision, randomUUID(), { type: 'tick' }, { ...ctx.state, towers: newKingdom().towers }, null), /Invalid/);
  await rpc('reconcile_library', user); check(await rpc('kingdom_snapshot', user), current);
  await db.query(`UPDATE public.concepts SET mastery='learning',reasoning_track='{}' WHERE user_id=$1 AND canonical_name IN ('Alias','Tower force')`, [user]);
  check((await rpc('kingdom_snapshot', user)).state.towers.points.force, 0); await compareDemo();
  check((await rpc('kingdom_snapshot', other)).state.towers, newKingdom().towers);
  await rpc('reset_learning_progress', user, 0);
  current = await rpc('kingdom_snapshot', user); check(current.state, newKingdom()); check(current.generation, 1);
  await assert.rejects(rpc('kingdom_command_context', user, 0), /reset/);
  for (const role of ['anon','authenticated']) {
    for (const fn of ['library_eligible_concepts(uuid)','tower_contribution(jsonb)'])
      check(await scalar(`SELECT has_function_privilege('${role}','public.${fn}','EXECUTE')`), false);
  }
  await db.query('DELETE FROM auth.users WHERE id IN ($1,$2)', [user, other]);
}
