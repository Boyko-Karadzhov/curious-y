import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moduleUrl } from './load-game.mjs';
const { preparedJourney, prepareFixtureNode } = await import(moduleUrl('src/tests/fixtures/preparedJourney.ts'));
const { DIMENSION_ORDER, knowledgeGraph } = await import(moduleUrl('supabase/functions/_shared/journey.ts'));
const { REASONING_COMPLEXITIES } = await import(moduleUrl('supabase/functions/_shared/reasoning.ts'));

function lazyNodes() {
  const fixture = preparedJourney('Life').nodes;
  const base = { ...fixture[0], id: 'base', title: 'Base', requires: [] };
  const leaf = { ...base, id: 'leaf', title: 'Leaf', expanded: false,
    dimensions: { intuition: 'Leaf intuition', precision: 'Leaf formal definition' } };
  const pending = { ...base, id: 'pending', title: 'Pending', expanded: false,
    dimensions: { intuition: 'Pending intuition', precision: 'Pending formal definition' }, requires: [{ nodeId: 'leaf' }] };
  const boss = prepareFixtureNode({ ...fixture.at(-1), requires: [base, pending].map(n => ({ nodeId: n.id })) });
  return [boss, base, pending, leaf];
}

async function save(h, owner, nodes, targetId, rootId) {
  const lease = await h.rpc('begin_graph_expansion', owner, 'Life', 0);
  const root = rootId ?? nodes.find(node => node.kind === 'boss').id;
  try {
    await h.rpc('save_generated_nodes', owner, 'Life', lease.lease, 0, root, JSON.stringify(nodes));
  } finally {
    await h.rpc('cancel_question_generation', owner, lease.lease);
  }
  return h.rpc('load_learning_graph', owner);
}

async function verifyPlaceholders(h, owner, nodes) {
  const stored = await save(h, owner, nodes, 'base');
  h.check(stored.nodes.length, 4);
  h.check(knowledgeGraph(stored).nodes.map(n => n.id), ['base']);
  await assert.rejects(h.rpc('begin_graph_question', owner, 'pending', 'intuition', null), /still hidden/);
  await assert.rejects(h.rpc('begin_graph_question', owner, nodes[0].id, null, null), /still hidden/);
  const pending = stored.nodes.find(n => n.id === 'pending');
  h.check(pending.expanded, false);
  h.check(Object.keys(pending.dimensions), ['intuition', 'precision']);
  return stored;
}

async function verifyExpansion(h, owner, stored) {
  const before = stored.nodes.find(n => n.id === 'pending');
  const ready = { ...prepareFixtureNode(before), topics: before.topics };
  const updated = await save(h, owner, [ready], 'leaf', 'pending');
  h.check(updated.nodes.length, 5);
  h.check(updated.nodes.filter(n => n.id === 'pending').length, 1);
  h.check(updated.nodes.every(n => !('requiredMasteryIds' in n) && !('prerequisiteConcepts' in n)
    && n.requires.every(edge => Object.keys(edge).join() === 'nodeId')), true);
  h.check(knowledgeGraph(updated).nodes.map(n => n.id), ['base']);
  await assert.rejects(h.rpc('begin_graph_question', owner, 'pending', 'intuition', null), /still hidden/);
  const retried = await save(h, owner, [ready], 'base', 'pending');
  h.check(retried.nodes, updated.nodes);
  await assert.rejects(save(h, owner, [{ ...ready, definition: 'Changed' }], 'base', 'pending'), /Only unfinished/);
  return updated;
}

async function verifyInvalidPatch(h, owner, stored) {
  const before = stored.nodes.find(n => n.id === 'pending');
  const invalid = prepareFixtureNode(before);
  invalid.requires = [];
  await assert.rejects(save(h, owner, [invalid], 'base', 'pending'), /preserve their identity and dependencies/);
  h.check((await h.rpc('load_learning_graph', owner)).nodes, stored.nodes);
  invalid.requires = before.requires;
  delete invalid.dimensions.precision;
  await assert.rejects(save(h, owner, [invalid], 'pending', 'pending'), /seven dimensions/);
}

async function verifyUnlock(h, owner, stored) {
  const progress = Object.fromEntries(['base', 'leaf', 'pending'].map(id => [id,
    Object.fromEntries([...DIMENSION_ORDER, ...REASONING_COMPLEXITIES].map(step => [step, { successes: 1, attempts: 1 }]))]));
  await h.db.query('UPDATE public.learning_graphs SET progress=$2 WHERE user_id=$1', [owner, progress]);
  const updated = await h.rpc('load_learning_graph', owner);
  h.check(knowledgeGraph(updated).nodes.length, 4);
  const lease = await h.rpc('begin_graph_question', owner, 'pending', 'intuition', null);
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
