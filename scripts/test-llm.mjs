import assert from 'node:assert/strict';
import { moduleUrl } from './load-game.mjs';

async function testBossDependencyTree(createBoss, key) {
  const expansion = await createBoss(key, 'Physics', { nodes: [], progress: {} });
  const [boss, ...concepts] = expansion.nodes;
  assert.equal(boss.id, expansion.rootId);
  assert.equal(boss.kind, 'boss');
  assert(concepts.length > 0, 'The boss prompt must return at least one prerequisite concept.');
  assert(concepts.every(node => node.kind === 'concept' && node.expanded === false));
  assert(concepts.every(node => node.dimensions.intuition && node.dimensions.precision));
  const ids = new Set(expansion.nodes.map(node => node.id));
  assert(expansion.nodes.every(node => node.requires.every(edge => ids.has(edge.nodeId))));
  console.log(`Live Gemini boss-tree test passed with ${concepts.length} concepts.`);
}

async function main() {
  const key = process.env.TEST_GEMINI_API_KEY;
  assert(key, 'TEST_GEMINI_API_KEY is required for live LLM tests.');
  const { createBoss } = await import(moduleUrl('supabase/functions/learning/curriculum.ts'));
  await testBossDependencyTree(createBoss, key);
}

function annotate(error) {
  const message = error instanceof Error ? error.message : String(error);
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  console.error(`::error title=Live Gemini test failed::${escaped}`);
  process.exitCode = 1;
}

main().catch(annotate);
