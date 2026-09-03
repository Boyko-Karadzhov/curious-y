import { Concept, Question, ReasoningComplexity, REASONING_COMPLEXITY_INFO } from '../../types';
import { ANGLES } from './prompt';

export const EXTRACT_CONCEPTS_SYSTEM_PROMPT = `You are an expert cognitive scientist and educational ontologist.
Your task is to analyze a learning question and extract its DIRECT required concepts, building a precise prerequisite Directed Acyclic Graph (DAG).

Definitions:
- Concept: A distinct, transferable unit of scientific or mathematical knowledge.
- Canonical Name: The standard, widely accepted name of the concept (e.g. "Newton's second law", "Refractive index").
- Aliases: Synonyms, alternate names, or mathematical formulations (e.g. ["second law of motion", "F = ma"]).
- isAtomic: Set to true ONLY if the concept is atomic enough to teach directly without prerequisite specialized terms, or represents general baseline knowledge (e.g., counting, ordinary language, speed, distance, object, change, before/after).
- Prerequisites: List of immediate concepts that must be understood before this concept can be mastered.

You MUST reply ONLY with a valid JSON array of concept objects with no surrounding markdown or explanation:
[
  {
    "canonicalName": "Concept Name",
    "definition": "Clear, concise 1-2 sentence definition.",
    "aliases": ["alias 1", "alias 2"],
    "topics": { "Physics": 1.0 },
    "isAtomic": false,
    "prerequisites": ["Prerequisite Concept 1", "Prerequisite Concept 2"]
  }
]`;

export const EXTRACT_CONCEPTS_JSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      canonicalName: { type: 'string', description: 'Standard concise name of the concept.' },
      definition: { type: 'string', description: 'Clear 1-2 sentence pedagogical definition.' },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Common alternative names or notations.',
      },
      topics: {
        type: 'object',
        additionalProperties: { type: 'number' },
        description: 'Mapping of Topic Name to weight (e.g. {"Physics": 1.0}).',
      },
      isAtomic: {
        type: 'boolean',
        description: 'True if atomic enough to teach directly or baseline everyday knowledge.',
      },
      prerequisites: {
        type: 'array',
        items: { type: 'string' },
        description: 'Canonical names of immediate required prerequisite concepts.',
      },
    },
    required: ['canonicalName', 'definition', 'aliases', 'topics', 'isAtomic', 'prerequisites'],
    additionalProperties: false,
  },
} as const;

export const GEMINI_EXTRACT_CONCEPTS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      canonicalName: { type: 'STRING' },
      definition: { type: 'STRING' },
      aliases: { type: 'ARRAY', items: { type: 'STRING' } },
      isAtomic: { type: 'BOOLEAN' },
      prerequisites: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['canonicalName', 'definition', 'aliases', 'isAtomic', 'prerequisites'],
  },
} as const;

export function getExtractConceptsUserPrompt(
  question: Question,
  existingRegistry: Concept[]
): string {
  const existingNames = existingRegistry
    .map((c) => `"${c.canonicalName}"${c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : ''}`)
    .join(', ');

  return `Extract the DIRECT required concepts for this Boss question:
- Topic: ${question.topic}
- Subtopic: ${question.subtopic || 'General'}
- Question: "${question.questionText}"
- Correct Answer: "${question.options[question.correctIndex]}"
- Explanation: "${question.explanation}"

EXISTING USER CONCEPT REGISTRY:
[${existingNames || 'None - user registry is currently empty'}]

CRITICAL CANONICALIZATION RULE:
If any required concept is already in the existing registry (or matches an alias), you MUST reuse that exact canonicalName.
Do not invent new names for concepts already in the registry.

Return a JSON array of 2 to 4 direct required concepts.`;
}

export function getExpandFrontierUserPrompt(
  conceptsToExpand: Array<{ canonicalName: string; definition: string; prerequisites: string[] }>,
  allKnownNames: string[]
): string {
  const list = conceptsToExpand
    .map(
      (c) =>
        `- "${c.canonicalName}": ${c.definition} (Unresolved prerequisites: ${c.prerequisites.join(', ')})`
    )
    .join('\n');

  return `Expand the unresolved prerequisite concepts for the following concepts:
${list}

KNOWN CONCEPTS (User registry + already discovered):
[${allKnownNames.join(', ')}]

INSTRUCTIONS:
1. For each unresolved prerequisite listed above, define it.
2. Mark whether it is atomic (basic/everyday notions or simple baseline).
3. If not atomic, provide its immediate prerequisites.
4. Reuse known concept names if applicable.

Return a JSON array of concept objects.`;
}

export function getConceptQuestionPrompt(
  concept: Concept,
  complexity: ReasoningComplexity,
  angle?: string,
  recentQuestions: string[] = []
): { prompt: string; angle: string } {
  const chosenAngle = angle || ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const complexityInfo = REASONING_COMPLEXITY_INFO[complexity];
  const primaryTopic =
    concept.topics && Object.keys(concept.topics).length > 0
      ? Object.keys(concept.topics)[0]
      : 'Physics';

  const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let prompt = `Generate a brand-new, unique "Why" microlearning multiple-choice question focusing on a specific Concept and Reasoning Complexity:

TARGET CONCEPT:
- Canonical Name: "${concept.canonicalName}"
- Definition: "${concept.definition}"
${concept.aliases?.length ? `- Aliases: [${concept.aliases.join(', ')}]\n` : ''}- Primary Topic: "${primaryTopic}"

REQUIRED REASONING COMPLEXITY:
- Complexity: ${complexityInfo.name}
- Requirement: ${complexityInfo.description}

EXPLORATION ANGLE:
- Angle: ${chosenAngle}

SESSION ENTROPY: [${nonce}]

CRITICAL PEDAGOGICAL RULES:
1. Question Text: MUST start with "Why" (e.g. "Why does...", "Why is...").
2. Core Focus: The question and explanation MUST directly test the concept "${concept.canonicalName}" through the lens of ${complexityInfo.name} (${complexityInfo.description}).
3. Exactly 4 plausible options (A, B, C, D) of similar length. Exactly one option unequivocally correct based on first principles.
4. Explanation: Provide clear, rigorous intuition explaining why the correct choice is right and how it exercises ${complexityInfo.name}.
5. AngleFit: 1-2 sentences explaining how this question embodies both the exploration angle and the ${complexityInfo.name} reasoning complexity.
6. Mathematical notation: Use standard $...$ for inline or $$...$$ for display math if equations or formulas appear.
7. Return ONLY valid JSON matching the schema.`;

  if (recentQuestions.length > 0) {
    const avoid = recentQuestions.slice(0, 6).map((q) => `  - "${q}"`).join('\n');
    prompt += `\n\nDO NOT repeat or make a variation of these recently asked questions:\n${avoid}`;
  }

  return { prompt, angle: chosenAngle };
}
