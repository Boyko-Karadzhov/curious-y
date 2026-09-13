import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
const { preparedJourney, prepareFixtureNode } = await import(moduleUrl('src/tests/fixtures/preparedJourney.ts'));

async function checkpointRoundtrip(h, owner) {
  const draft = { topic: 'Life', nodes: [], queue: [{ stage: 'knowledge', nodeId: 'pending' }] };
  const first = await h.rpc('begin_curriculum_stage', owner, 'Life', 0);
  await assert.rejects(h.rpc('begin_curriculum_stage', owner, 'Life', 0), /being generated/);
  await assert.rejects(h.rpc('save_curriculum_stage', owner, 'Life', randomUUID(), 0, draft), /expired/);
  await h.rpc('save_curriculum_stage', owner, 'Life', first.lease, 0, draft);
  await h.rpc('cancel_question_generation', owner, first.lease);
  const resumed = await h.rpc('begin_curriculum_stage', owner, 'Life', 0);
  h.check(resumed.draft, draft);
  h.check(resumed.graph.nodes, []);
  return resumed;
}

async function finishCheckpoint(h, owner, lease) {
  const plan = preparedJourney('Life');
  const draft = { topic: 'Life', nodes: plan.nodes, queue: [] };
  const invalid = structuredClone(draft);
  delete invalid.nodes[0].curriculum.dimensions.precision;
  await assert.rejects(h.rpc('save_curriculum_stage', owner, 'Life', lease, 0, invalid), /all seven dimensions/);
  h.check((await h.rpc('load_learning_graph', owner)).nodes, []);
  await h.rpc('save_curriculum_stage', owner, 'Life', lease, 0, draft);
  await h.rpc('cancel_question_generation', owner, lease);
  h.check(await h.scalar('SELECT count(*)::integer FROM public.curriculum_drafts WHERE user_id=$1', [owner]), 0);
}

async function resetCheckpoint(h, owner) {
  const lease = await h.rpc('begin_curriculum_stage', owner, 'Physics', 0);
  const draft = { topic: 'Physics', nodes: [], queue: [{ stage: 'dependencies' }] };
  await h.rpc('save_curriculum_stage', owner, 'Physics', lease.lease, 0, draft);
  await h.rpc('reset_learning_progress', owner, 0);
  h.check(await h.scalar('SELECT count(*)::integer FROM public.curriculum_drafts WHERE user_id=$1', [owner]), 0);
  await assert.rejects(h.rpc('save_curriculum_stage', owner, 'Physics', lease.lease, 0, draft), /reset/);
}

async function privateDrafts(h) {
  await h.db.exec('SET ROLE authenticated');
  await h.denied('SELECT * FROM public.curriculum_drafts');
  await h.denied('SELECT public.begin_curriculum_stage($1,$2,0)', [randomUUID(), 'Life']);
  await h.db.exec('RESET ROLE');
}

async function retryBoss(h, owner) {
  const boss = prepareFixtureNode({ ...preparedJourney('Life').nodes.at(-1), requires: [], prerequisiteConcepts: [] });
  await h.rpc('save_graph_expansion', owner, 'Life', JSON.stringify([boss]), 1);
  const first = await issueBoss(h, owner, boss);
  await h.rpc('record_question_answer', owner, first.id, 1);
  await h.rpc('collect_learning_reward', owner, first.id);
  const retry = await issueBoss(h, owner, boss);
  h.check(retry.question_text, first.question_text);
  await h.rpc('record_question_answer', owner, retry.id, 0);
  await h.rpc('collect_learning_reward', owner, retry.id);
  await assert.rejects(h.rpc('begin_graph_question', owner, boss.id, 'mechanism'), /still hidden/);
}

async function issueBoss(h, owner, boss) {
  const lease = await h.rpc('begin_graph_question', owner, boss.id, 'mechanism');
  return h.rpc('finish_graph_question', owner, lease.lease, 1, boss.id, 'mechanism', {
    question_text: boss.title, options: ['Correct', 'Wrong one', 'Wrong two', 'Wrong three'], correct_index: 0,
    explanation: 'Reasoning', knowledge_entry: 'Synthesis', option_feedback: ['Correct reasoning', 'Misconception', 'Misconception', 'Misconception'],
  });
}

export async function testCurriculum(h) {
  const owner = randomUUID();
  await h.db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  await privateDrafts(h);
  const lease = await checkpointRoundtrip(h, owner);
  await finishCheckpoint(h, owner, lease.lease);
  await resetCheckpoint(h, owner);
  await retryBoss(h, owner);
  await h.db.query('DELETE FROM auth.users WHERE id=$1', [owner]);
}
