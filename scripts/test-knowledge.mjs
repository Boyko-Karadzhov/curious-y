import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { moduleUrl } from './load-game.mjs';

const { prepareKnowledge } = await import(moduleUrl('supabase/functions/learning/curriculumContent.ts'));
const { journeyQuestionPrompt } = await import(moduleUrl('supabase/functions/learning/questionPrompt.ts'));
const { structured } = await import(moduleUrl('supabase/functions/learning/structured.ts'));
const { questionSchema, validateQuestionContent } = await import(moduleUrl('supabase/functions/learning/questionContent.ts'));

const cases = [
  {
    id: 'isostasy',
    title: "Archimedes' Principle for Solid Earth",
    topic: 'Earth & Space',
    intuition: 'When you push a beach ball underwater, it fights back because it weighs less than the water it pushes aside.',
    precision: 'An object submerged in a fluid experiences an upward buoyant force equal to the weight of the displaced fluid.'
  },
  {
    id: 'corroboration',
    title: 'Corroborating independent historical sources',
    topic: 'Society & History',
    intuition: 'Hearing the same story from different people can make it more believable.',
    precision: 'Agreement between independent historical sources can strengthen a claim, subject to source reliability and shared biases.'
  }
];

function concept(sample) {
  return {
    id: sample.id,
    title: sample.title,
    topic: sample.topic,
    kind: 'concept',
    expanded: false,
    definition: sample.precision,
    dimensions: { intuition: sample.intuition, precision: sample.precision },
    requires: []
  };
}

async function evaluate(key, sample) {
  const node = concept(sample);
  const started = Date.now();
  const dimensions = await prepareKnowledge(key, node);
  const lessonMs = Date.now() - started;
  assert.notEqual(dimensions.precision, node.dimensions.precision, 'The planning summary must be developed into a lesson.');
  const prompt = journeyQuestionPrompt({ ...node, dimensions, expanded: true }, 'application');
  const question = await structured(key, prompt, questionSchema, validateQuestionContent, true, 'knowledge');
  const result = { title: node.title, lessonMs, elapsedMs: Date.now() - started, dimensions, question };
  writeFileSync(`.cache/knowledge-${sample.id}.json`, JSON.stringify(result, null, 2));
  console.log(`${sample.id}: one-shot lesson and application question saved to .cache/knowledge-${sample.id}.json (${result.elapsedMs} ms).`);
}

async function main() {
  const key = process.env.TEST_GEMINI_API_KEY;
  assert(key, 'TEST_GEMINI_API_KEY is required for live knowledge tests.');
  mkdirSync('.cache', { recursive: true });
  for (const sample of cases) {
    await evaluate(key, sample);
  }
}

// Live smoke test, not a factual-accuracy score: inspect the saved lessons and questions.
main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
