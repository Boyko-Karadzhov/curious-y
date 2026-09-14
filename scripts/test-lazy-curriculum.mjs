import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
const { preparedJourney, prepareFixtureNode } = await import(moduleUrl('src/tests/fixtures/preparedJourney.ts'));
const { knowledgeGraph } = await import(moduleUrl('supabase/functions/_shared/journey.ts'));

function lazyNodes() {
  const fixture = preparedJourney('Life').nodes;
  const base = { ...fixture[0], id: 'base', title: 'Base', requires: [], prerequisiteConcepts: [] };
  const pending = { ...base, id: 'pending', title: 'Pending', expanded: false };
  delete pending.curriculum;
  const boss = prepareFixtureNode({ ...fixture.at(-1), requires: [base, pending].map(n => ({ nodeId: n.id, facets: n.facets })), prerequisiteConcepts: ['Base', 'Pending'] });
  return [boss, base, pending];
}

async function save(h, owner, nodes, targetId, rootId) {
  const lease = await h.rpc('begin_curriculum_stage', owner, 'Life', 0);
  const draft = { topic: 'Life', nodes, queue: [], targetId, ...(rootId ? { rootId } : {}) };
  try {
    await h.rpc('save_curriculum_stage', owner, 'Life', lease.lease, 0, draft);
  } finally {
    await h.rpc('cancel_question_generation', owner, lease.lease);
  }
  return h.rpc('load_learning_graph', owner);
}

async function verifyPlaceholders(h, owner, nodes) {
  const stored = await save(h, owner, nodes, 'base');
  h.check(stored.nodes.length, 3);
  h.check(knowledgeGraph(stored).nodes.map(n => n.id), ['base']);
  await assert.rejects(h.rpc('begin_graph_question', owner, 'pending', 'intuition'), /still hidden/);
  await assert.rejects(h.rpc('begin_graph_question', owner, nodes[0].id, 'mechanism'), /still hidden/);
  const pending = stored.nodes.find(n => n.id === 'pending');
  h.check(pending.expanded, false);
  h.check(pending.curriculum, undefined);
  return stored;
}

async function verifyExpansion(h, owner, stored) {
  const before = stored.nodes.find(n => n.id === 'pending');
  const leaf = { ...stored.nodes.find(n => n.id === 'base'), id: 'leaf', title: 'Leaf' };
  const ready = { ...prepareFixtureNode(before), topics: before.topics, requires: [{ nodeId: 'leaf', facets: leaf.facets }], prerequisiteConcepts: ['Leaf'] };
  const updated = await save(h, owner, [ready, leaf], 'leaf', 'pending');
  h.check(updated.nodes.length, 5);
  h.check(updated.nodes.filter(n => n.id === 'pending').length, 1);
  h.check(updated.nodes.filter(n => n.kind === 'boss').map(n => n.requiredMasteryIds.sort()),
    [['base', 'leaf', 'pending'], ['base', 'leaf', 'pending']]);
  h.check(knowledgeGraph(updated).nodes.map(n => n.id), ['base', 'leaf']);
  await assert.rejects(h.rpc('begin_graph_question', owner, 'pending', 'intuition'), /still hidden/);
  await assert.rejects(save(h, owner, [ready], 'base', 'pending'), /Only unexpanded/);
  return updated;
}

async function verifyInvalidPatch(h, owner, stored) {
  const before = stored.nodes.find(n => n.id === 'pending');
  const invalid = prepareFixtureNode(before);
  invalid.requires = [{ nodeId: 'pending', facets: invalid.facets }];
  invalid.prerequisiteConcepts = ['Pending'];
  await assert.rejects(save(h, owner, [invalid], 'base', 'pending'), /cycle/);
  h.check((await h.rpc('load_learning_graph', owner)).nodes, stored.nodes);
  delete invalid.curriculum.dimensions.precision;
  invalid.requires = [];
  invalid.prerequisiteConcepts = [];
  await assert.rejects(save(h, owner, [invalid], 'pending', 'pending'), /seven dimensions/);
}

async function verifyUnlock(h, owner, stored) {
  const progress = Object.fromEntries(['base', 'leaf', 'pending'].map(id => [id,
    Object.fromEntries([...stored.nodes[1].facets, 'advanced'].map(f => [f, { successes: 3, attempts: 3 }]))]));
  await h.db.query('UPDATE public.learning_graphs SET progress=$2 WHERE user_id=$1', [owner, progress]);
  const updated = await h.rpc('load_learning_graph', owner);
  h.check(knowledgeGraph(updated).nodes.length, 5);
  const lease = await h.rpc('begin_graph_question', owner, 'pending', 'intuition');
  await h.rpc('cancel_question_generation', owner, lease.lease);
}

async function sharePrerequisites(h, owner, stored) {
  const boss = prepareFixtureNode({ ...stored.nodes[0], id: 'cross-boss', title: 'Shared question?', topic: 'Physics' });
  return h.rpc('save_graph_expansion', owner, 'Physics', JSON.stringify([boss]), 0);
}

export async function testLazyCurriculum(h) {
  const owner = randomUUID();
  await h.db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
  const stored = await verifyPlaceholders(h, owner, lazyNodes());
  await verifyInvalidPatch(h, owner, stored);
  const shared = await sharePrerequisites(h, owner, stored);
  const updated = await verifyExpansion(h, owner, shared);
  await verifyUnlock(h, owner, updated);
  await h.db.query('DELETE FROM auth.users WHERE id=$1', [owner]);
}
