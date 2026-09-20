import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
import { testLazyCurriculum } from './test-lazy-curriculum.mjs';
const { preparedJourney, prepareFixtureNode } = await import(moduleUrl('src/tests/fixtures/preparedJourney.ts'));

async function savePreparedStage(h, owner) {
  const node = prepareFixtureNode({ ...preparedJourney('Life').nodes[0], id: 'curriculum-seed', title: 'Curriculum seed' });
  node.expanded = false;
  node.requires = [];
  node.dimensions = { intuition: node.dimensions.intuition, precision: node.dimensions.precision };
  const first = await h.rpc('begin_graph_expansion', owner, 'Life', 0);
  await assert.rejects(h.rpc('begin_graph_expansion', owner, 'Life', 0), /being generated/);
  await assert.rejects(h.rpc('save_generated_nodes', owner, 'Life', randomUUID(), 0, node.id, JSON.stringify([node])), /expired/);
  await h.rpc('save_generated_nodes', owner, 'Life', first.lease, 0, node.id, JSON.stringify([node]));
  await h.rpc('cancel_question_generation', owner, first.lease);
  h.check((await h.rpc('load_learning_graph', owner)).nodes, [node]);
}

async function rejectInvalidAndReset(h, owner) {
  const lease = await h.rpc('begin_graph_expansion', owner, 'Life', 0);
  const invalid = structuredClone((await h.rpc('load_learning_graph', owner)).nodes[0]);
  delete invalid.dimensions.precision;
  await assert.rejects(h.rpc('save_generated_nodes', owner, 'Life', lease.lease, 0, invalid.id, JSON.stringify([invalid])), /intuition and a formal definition/);
  await h.rpc('cancel_question_generation', owner, lease.lease);
  const resetLease = await h.rpc('begin_graph_expansion', owner, 'Physics', 0);
  await h.rpc('reset_learning_progress', owner, 0);
  await assert.rejects(h.rpc('save_generated_nodes', owner, 'Physics', resetLease.lease, 0, invalid.id, JSON.stringify([invalid])), /reset/);
}

async function privateGeneration(h) {
  h.check(await h.scalar("SELECT to_regclass('public.curriculum_drafts')"), null);
  await h.db.exec('SET ROLE authenticated');
  await h.denied('SELECT public.begin_graph_expansion($1,$2,0)', [randomUUID(), 'Life']);
  await h.db.exec('RESET ROLE');
}

async function retryBoss(h, owner) {
  const boss = prepareFixtureNode({ ...preparedJourney('Life').nodes.at(-1), requires: [] });
  await h.rpc('save_graph_expansion', owner, 'Life', JSON.stringify([boss]), 1);
  const first = await issueBoss(h, owner, boss);
  await h.rpc('record_question_answer', owner, first.id, 1);
  await h.rpc('collect_learning_reward', owner, first.id);
  const retry = await issueBoss(h, owner, boss);
  h.check(retry.question_text, first.question_text);
  await h.rpc('record_question_answer', owner, retry.id, 0);
  await h.rpc('collect_learning_reward', owner, retry.id);
  await assert.rejects(h.rpc('begin_graph_question', owner, boss.id, null, null), /still hidden/);
}

async function issueBoss(h, owner, boss) {
  const lease = await h.rpc('begin_graph_question', owner, boss.id, null, null);
  return h.rpc('finish_graph_question', owner, lease.lease, 1, boss.id, null, null, {
    question_text: boss.title, options: ['Correct', 'Wrong one', 'Wrong two', 'Wrong three'], correct_index: 0,
    explanation: 'Reasoning', option_feedback: ['Correct reasoning', 'Misconception', 'Misconception', 'Misconception'],
  });
}

export async function testCurriculum(h) {
  await testLazyCurriculum(h);
  const owner = randomUUID();
  await h.db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  await privateGeneration(h);
  await savePreparedStage(h, owner);
  await rejectInvalidAndReset(h, owner);
  await retryBoss(h, owner);
  await h.db.query('DELETE FROM auth.users WHERE id=$1', [owner]);
}
