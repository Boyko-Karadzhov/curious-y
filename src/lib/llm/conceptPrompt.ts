import { Concept, Question, ReasoningComplexity, REASONING_COMPLEXITY_INFO, TOPICS } from '../../types';
import { getPrimaryTopic } from '../concepts/registry';
import { ANGLES } from './prompt';

export const EXTRACT_CONCEPTS_SYSTEM_PROMPT = `You are an expert cognitive scientist and educational ontologist.
Your task is to analyze a learning question and extract its DIRECT required concepts, building a precise prerequisite Directed Acyclic Graph (DAG).

Standard Knowledge Domains:
${TOPICS.map((t) => `- "${t}"`).join('\n')}

Definitions:
- Concept: A distinct, transferable unit of scientific or mathematical knowledge.
- Canonical Name: The standard, widely accepted name of the concept (e.g. "Newton's second law", "Refractive index").
- Aliases: Synonyms, alternate names, or mathematical formulations (e.g. ["second law of motion", "F = ma"]).
- Topics: A distribution of relevance weights across the 8 standard domains above.
  CRITICAL TOPIC CLASSIFICATION RULES:
  1. INTRINSIC DOMAIN CLASSIFICATION: Classify each concept by its intrinsic scientific foundation, NOT merely the context of the question it appeared in!
     - "Velocity", "Acceleration", "Momentum", "Force", "Fluid dynamics", "Kinetic energy", "Escape velocity" are fundamentally PHYSICS concepts (even when asked in an Earth & Space or planetary context).
     - "Electric charge", "Electromagnetic radiation", "Coulomb's law", "Photon" are fundamentally PHYSICS concepts (even when asked in a Chemistry context).
     - "Plate tectonics", "Atmospheric pressure", "Ocean currents" are fundamentally EARTH & SPACE.
     - "DNA replication", "Enzyme kinetics", "Cellular respiration" are fundamentally LIFE.
  2. MULTI-TOPIC DISTRIBUTION: When a concept bridges or is deeply shared across multiple domains, distribute weights across all relevant topics (weights between 0.1 and 0.9, summing to 1.0):
     - "Velocity": Primary is "Physics" (0.8), secondary is "Mathematics & Logic" (0.2).
     - "Fluid dynamics": Primary is "Physics" (0.8), secondary is "Earth & Space" (0.2).
     - "Electric charge": Primary is "Physics" (0.7), secondary is "Chemistry" (0.3).
     - "Electromagnetic radiation": Primary is "Physics" (0.7), secondary is "Chemistry" (0.3).
     - "Diffusion": "Chemistry" (0.5), "Physics" (0.3), "Life" (0.2).
     - "Coriolis effect": "Earth & Space" (0.6), "Physics" (0.4).
     - "Derivative": "Mathematics & Logic" (0.8), "Physics" (0.2).
     - "Neural network": "Computer Science" (0.7), "Mind & Behavior" (0.3).
  3. NEVER assign 100% of a foundational physics concept to "Earth & Space" or "Chemistry" just because the scenario was about planets, oceans, or chemical cells!
- isAtomic: Set to true ONLY if the concept is an irreducible pedagogical primitive or universal everyday intuition (e.g., counting, spatial distance, pushing/pulling, change over time, hot vs cold, faster vs slower, before vs after).
  CRITICAL RULE FOR isAtomic:
  "isAtomic" refers to PEDAGOGICAL PRIMITIVES that an untrained person or 10-year-old intuitively understands with zero science coursework.
  It does NOT mean "atomic physics", "subatomic particles", or "fundamental laws of physics"!
  NEVER mark advanced physical concepts, potentials, or fundamental forces as atomic:
  * "Strong nuclear force" is NOT atomic. It requires prerequisites: Atomic nucleus, Protons and Neutrons, Electrostatic repulsion, Fundamental interactions.
  * "Coulomb potential" is NOT atomic. It requires prerequisites: Electric charge, Potential energy, Electrostatic force / Coulomb's law.
  * Quantum mechanics, Thermodynamics, Relativity, Field theories, Molecular bonding, and Calculus concepts are NEVER atomic and MUST have prerequisites.
- Prerequisites: List of immediate concepts that must be understood before this concept can be mastered. If a concept is not a universal everyday primitive, it MUST have 1 to 3 direct prerequisites.

You MUST reply ONLY with a valid JSON array of concept objects with no surrounding markdown or explanation:
[
  {
    "canonicalName": "Concept Name",
    "definition": "Clear, concise 1-2 sentence definition.",
    "aliases": ["alias 1", "alias 2"],
    "topics": [
      { "topic": "Physics", "weight": 0.7 },
      { "topic": "Chemistry", "weight": 0.3 }
    ],
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
        type: 'array',
        description: 'Relevance distribution across standard topics (weights summing to 1.0). Multi-disciplinary concepts should have multiple topics.',
        items: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: [
                'Physics',
                'Mathematics & Logic',
                'Chemistry',
                'Life',
                'Computer Science',
                'Earth & Space',
                'Mind & Behavior',
                'Society & History',
              ],
            },
            weight: {
              type: 'number',
              description: 'Weight between 0.1 and 1.0',
            },
          },
          required: ['topic', 'weight'],
          additionalProperties: false,
        },
      },
      isAtomic: {
        type: 'boolean',
        description: 'True ONLY if an irreducible everyday layperson intuition (e.g. distance, pushing, counting). NEVER true for advanced physics/chemistry like fundamental forces, potentials, or academic laws.',
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
      topics: {
        type: 'ARRAY',
        description: 'Relevance distribution across standard topics (weights summing to 1.0). Multi-topic distributions are strongly encouraged for cross-disciplinary concepts.',
        items: {
          type: 'OBJECT',
          properties: {
            topic: {
              type: 'STRING',
              enum: [
                'Physics',
                'Mathematics & Logic',
                'Chemistry',
                'Life',
                'Computer Science',
                'Earth & Space',
                'Mind & Behavior',
                'Society & History',
              ],
            },
            weight: {
              type: 'NUMBER',
              description: 'Relevance weight between 0.1 and 1.0 (must sum to 1.0)',
            },
          },
          required: ['topic', 'weight'],
        },
      },
      isAtomic: { type: 'BOOLEAN' },
      prerequisites: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['canonicalName', 'definition', 'aliases', 'topics', 'isAtomic', 'prerequisites'],
  },
} as const;

export function getExtractConceptsUserPrompt(
  question: Question,
  existingRegistry: Concept[],
  targetConcept?: Concept
): string {
  const existingNames = existingRegistry
    .map((c) => `"${c.canonicalName}"${c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : ''}`)
    .join(', ');

  const targetName = targetConcept?.canonicalName || question.concept;
  const questionType = targetName ? `concept question for "${targetName}"` : 'Boss question';
  const targetNote = targetName
    ? `- Target Concept Tested: "${targetName}"\n`
    : '';

  return `Extract the DIRECT required concepts for this ${questionType}:
- Question Topic: ${question.topic}
- Subtopic: ${question.subtopic || 'General'}
${targetNote}- Question: "${question.questionText}"
- Correct Answer: "${question.options[question.correctIndex]}"
- Explanation: "${question.explanation}"

EXISTING USER CONCEPT REGISTRY:
[${existingNames || 'None - user registry is currently empty'}]

CRITICAL CANONICALIZATION RULE:
If any required concept is already in the existing registry (or matches an alias), you MUST reuse that exact canonicalName.
Do not invent new names for concepts already in the registry.

CRITICAL TOPIC CLASSIFICATION:
Classify each concept by its INTRINSIC discipline across the 8 standard topics (Physics, Mathematics & Logic, Chemistry, Life, Computer Science, Earth & Space, Mind & Behavior, Society & History).
Do not assign a physics concept (like Velocity, Fluid dynamics, Electric charge) solely to Earth & Space or Chemistry just because the question context was in that area. Distribute weights across multiple topics when appropriate (e.g. Physics 0.7, Chemistry 0.3).

PEDAGOGICAL PREREQUISITE RULE:
Do not mark advanced concepts as atomic. Fundamental forces and advanced potentials (like "Strong nuclear force" or "Coulomb potential") MUST have their own prerequisites (e.g. "Electric charge", "Atomic nucleus").

Return a JSON array of 1 to 4 direct required concepts needed to understand and solve this question.`;
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
2. Provide its intrinsic topics distribution across the 8 standard topics (weights between 0.1 and 1.0 summing to 1.0). Multi-disciplinary concepts should have multiple topics.
3. Mark whether it is atomic.
   REMEMBER: "atomic" means an irreducible everyday layperson intuition (e.g. distance, speed, pushing, counting). Advanced physical forces (e.g. "Strong nuclear force", "Coulomb potential", "Gravitational force"), subatomic physics, or mathematical laws are NOT atomic and MUST have their own immediate prerequisites.
4. If not atomic, provide its immediate prerequisites (1 to 3 direct prerequisites).
5. Reuse known concept names if applicable.

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
  const primaryTopic = getPrimaryTopic(concept.topics);

  const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const prereqList =
    concept.prerequisites && concept.prerequisites.length > 0
      ? concept.prerequisites.join(', ')
      : 'Universal pedagogical primitives / basic intuitions';

  let prompt = `Generate a brand-new, unique "Why" microlearning multiple-choice question focusing on a specific Concept and Reasoning Complexity:

TARGET CONCEPT:
- Canonical Name: "${concept.canonicalName}"
- Definition: "${concept.definition}"
${concept.aliases?.length ? `- Aliases: [${concept.aliases.join(', ')}]\n` : ''}- Primary Topic: "${primaryTopic}"
- Mastered Prerequisites: [${prereqList}]

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
7. STRICT PREREQUISITE GROUNDING: The student has ONLY mastered the prerequisites listed above: [${prereqList}]. The question, options, and explanation MUST be fully understandable and solvable using ONLY "${concept.canonicalName}" and these mastered prerequisites. Do NOT introduce or assume unmastered external concepts from all over the place!
8. Return ONLY valid JSON matching the schema.`;

  if (recentQuestions.length > 0) {
    const avoid = recentQuestions.slice(0, 6).map((q) => `  - "${q}"`).join('\n');
    prompt += `\n\nDO NOT repeat or make a variation of these recently asked questions:\n${avoid}`;
  }

  return { prompt, angle: chosenAngle };
}
