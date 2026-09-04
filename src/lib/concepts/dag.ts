import { Concept, Question, UserSettings } from '../../types';
import { createDefaultReasoningTrack, createMasteredReasoningTrack } from './mastery';
import {
  areAllPrerequisitesProficient,
  canonicalizeConceptName,
  findConcept,
} from './registry';
import { inferConceptTopics, normalizeConceptTopics } from './classifier';
import {
  EXTRACT_CONCEPTS_SYSTEM_PROMPT,
  EXTRACT_CONCEPTS_JSON_SCHEMA,
  GEMINI_EXTRACT_CONCEPTS_SCHEMA,
  getExtractConceptsUserPrompt,
  getExpandFrontierUserPrompt,
} from '../llm/conceptPrompt';
import { extractJsonFromResponse } from '../llm/prompt';

export interface RawConceptExtraction {
  canonicalName: string;
  definition: string;
  aliases?: string[];
  topics?: Record<string, number> | Array<{ topic: string; weight: number }>;
  isAtomic?: boolean;
  prerequisites?: string[];
  isDirect?: boolean;
}

export interface BuildDAGResult {
  newConcepts: Concept[];
  directPrerequisites: string[];
  allPrerequisitesProficient: boolean;
}

// Sample pre-curated DAGs for Explorer Demo Mode and deterministic testing
const CURATED_SAMPLE_DAGS: Record<string, RawConceptExtraction[]> = {
  // Light refraction (Physics)
  'refract': [
    {
      canonicalName: "Snell's law",
      definition: "The ratio of the sines of the angles of incidence and refraction equals the ratio of phase velocities in the two media.",
      aliases: ['law of refraction', 'n1 sin theta1 = n2 sin theta2'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      isDirect: true,
      prerequisites: ['Refractive index', 'Phase velocity', 'Wavefront'],
    },
    {
      canonicalName: "Fermat's principle",
      definition: "Light follows the path that minimizes elapsed travel time between two points.",
      aliases: ['principle of least time'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      isDirect: true,
      prerequisites: ['Speed of light', 'Optical path length'],
    },
    {
      canonicalName: 'Refractive index',
      definition: 'Dimensionless ratio representing how much the phase velocity of light is reduced inside a medium compared to vacuum.',
      aliases: ['index of refraction', 'optical density'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      prerequisites: ['Speed of light', 'Phase velocity'],
    },
    {
      canonicalName: 'Phase velocity',
      definition: 'The rate at which wave crests and troughs propagate through space in a medium.',
      aliases: ['wave velocity'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      prerequisites: ['Wavelength', 'Wave frequency'],
    },
    {
      canonicalName: 'Optical path length',
      definition: 'The product of the geometric length of the path light follows through a medium and the refractive index of that medium.',
      aliases: ['OPL'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      prerequisites: ['Refractive index'],
    },
    {
      canonicalName: 'Speed of light',
      definition: 'Universal physical constant $c$ governing electromagnetic wave speed in vacuum.',
      aliases: ['c', 'speed of light in vacuum'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Wavefront',
      definition: 'Geometric surface over which oscillating wave disturbances have an identical phase.',
      aliases: ['wave crest surface'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Wavelength',
      definition: 'Spatial distance between consecutive points of corresponding phase in a repeating wave.',
      aliases: ['spatial period', 'lambda'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Wave frequency',
      definition: 'The number of complete oscillations or cycles occurring per unit time.',
      aliases: ['temporal frequency', 'hertz'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
  ],

  // Ice skater rotation / Angular momentum (Physics)
  'skater': [
    {
      canonicalName: 'Conservation of angular momentum',
      definition: 'Total angular momentum of an isolated system remains constant when zero net external torque acts on it.',
      aliases: ['angular momentum conservation', 'L = I omega'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      isDirect: true,
      prerequisites: ['Moment of inertia', 'Angular velocity', 'Torque'],
    },
    {
      canonicalName: 'Moment of inertia',
      definition: 'A quantitative measure of an object rotational inertia with respect to a chosen axis of rotation.',
      aliases: ['rotational inertia', 'mass moment of inertia'],
      topics: { Physics: 1.0 },
      isAtomic: false,
      prerequisites: ['Mass distribution', 'Axis of rotation'],
    },
    {
      canonicalName: 'Angular velocity',
      definition: 'Vector measure of the rotation rate and orientation of an object around an axis.',
      aliases: ['rotational speed', 'omega'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Torque',
      definition: 'The rotational analog of linear force measuring tendency to produce angular acceleration.',
      aliases: ['moment of force'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Mass distribution',
      definition: 'Spatial arrangement of mass relative to a designated reference axis.',
      aliases: ['radial mass distance'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Axis of rotation',
      definition: 'Straight line around which three-dimensional rigid bodies rotate.',
      aliases: ['rotation center'],
      topics: { Physics: 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
  ],

  // Calculus exponential derivative (Mathematics & Logic)
  'exponential': [
    {
      canonicalName: 'Natural exponential derivative',
      definition: 'Identity stating that the derivative of e^x equals itself due to the unique limit definition of base e.',
      aliases: ['d/dx e^x = e^x'],
      topics: { 'Mathematics & Logic': 1.0 },
      isAtomic: false,
      isDirect: true,
      prerequisites: ["Euler's number", 'Derivative', 'Limits'],
    },
    {
      canonicalName: "Euler's number",
      definition: 'Mathematical constant e approximately 2.71828 satisfying lim (e^h - 1)/h = 1 as h approaches 0.',
      aliases: ['base of natural logarithm', 'constant e'],
      topics: { 'Mathematics & Logic': 1.0 },
      isAtomic: false,
      prerequisites: ['Limits', 'Continuous growth'],
    },
    {
      canonicalName: 'Derivative',
      definition: 'The instantaneous rate of change of a function with respect to its variable.',
      aliases: ['differential', 'tangent slope'],
      topics: { 'Mathematics & Logic': 1.0 },
      isAtomic: false,
      prerequisites: ['Limits', 'Difference quotient'],
    },
    {
      canonicalName: 'Limits',
      definition: 'The value that a function or sequence approaches as the input or index approaches some value.',
      aliases: ['limit concept'],
      topics: { 'Mathematics & Logic': 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Continuous growth',
      definition: 'Growth process where increments compound continuously at every instant.',
      aliases: ['exponential growth'],
      topics: { 'Mathematics & Logic': 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
    {
      canonicalName: 'Difference quotient',
      definition: 'Ratio expressing average rate of change between two coordinates along a curve.',
      aliases: ['secant slope'],
      topics: { 'Mathematics & Logic': 1.0 },
      isAtomic: true,
      prerequisites: [],
    },
  ],
};

/**
 * Heuristically finds or creates a curated sample DAG for demo/offline mode.
 */
function getCuratedSampleDAG(question: Question, targetConcept?: Concept): RawConceptExtraction[] {
  const targetName = (targetConcept?.canonicalName || question.concept || '').toLowerCase();
  if (targetName) {
    for (const list of Object.values(CURATED_SAMPLE_DAGS)) {
      if (
        list.some(
          (c) =>
            c.canonicalName.toLowerCase() === targetName ||
            (c.aliases && c.aliases.some((a) => a.toLowerCase() === targetName))
        )
      ) {
        return list;
      }
    }
  }

  const text = `${question.questionText} ${question.explanation} ${question.subtopic || ''}`.toLowerCase();

  if (text.includes('refract') || text.includes('light') || text.includes('snell') || text.includes('fermat') || text.includes('bend')) {
    return CURATED_SAMPLE_DAGS['refract'];
  }
  if (text.includes('skater') || text.includes('angular') || text.includes('rotat') || text.includes('torque') || text.includes('astronaut') || text.includes('station') || text.includes('float') || text.includes('gravity') || text.includes('orbit')) {
    return CURATED_SAMPLE_DAGS['skater'];
  }
  if (text.includes('exponential') || text.includes('derivative') || text.includes('euler') || text.includes('calc')) {
    return CURATED_SAMPLE_DAGS['exponential'];
  }

  for (const [keyword, concepts] of Object.entries(CURATED_SAMPLE_DAGS)) {
    if (text.includes(keyword)) {
      return concepts;
    }
  }

  // Generic fallback DAG constructed from question's topic and keywords
  const primaryTopic = question.topic || 'Physics';
  const sub = question.subtopic || targetConcept?.canonicalName || 'Fundamental Principles';

  return [
    {
      canonicalName: `${sub} principle`,
      definition: `The fundamental principle governing ${sub.toLowerCase()} in ${primaryTopic}.`,
      aliases: [`core ${sub.toLowerCase()}`],
      topics: inferConceptTopics(`${sub} principle`, '', primaryTopic),
      isAtomic: false,
      isDirect: true,
      prerequisites: [`Primary mechanism of ${sub}`, 'Baseline causality'],
    },
    {
      canonicalName: `Primary mechanism of ${sub}`,
      definition: `The specific causal relation explaining why ${sub.toLowerCase()} occurs as observed.`,
      aliases: [`mechanism of ${sub.toLowerCase()}`],
      topics: { [primaryTopic]: 1.0 },
      isAtomic: false,
      isDirect: false,
      prerequisites: ['Baseline causality', 'State change'],
    },
    {
      canonicalName: 'Baseline causality',
      definition: 'The fundamental relation between causes and their direct physical or mathematical effects.',
      aliases: ['cause and effect'],
      topics: { [primaryTopic]: 1.0 },
      isAtomic: true,
      isDirect: false,
      prerequisites: [],
    },
    {
      canonicalName: 'State change',
      definition: 'The transition of an observable system from one well-defined configuration to another.',
      aliases: ['transition'],
      topics: { [primaryTopic]: 1.0 },
      isAtomic: true,
      isDirect: false,
      prerequisites: [],
    },
  ];
}

function getCuratedDirectConcepts(
  question: Question,
  targetConcept?: Concept
): RawConceptExtraction[] {
  const full = getCuratedSampleDAG(question, targetConcept);
  const targetName = targetConcept?.canonicalName || question.concept;

  if (targetName) {
    const normTarget = targetName.toLowerCase();
    const matched = full.find(
      (c) =>
        c.canonicalName.toLowerCase() === normTarget ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase() === normTarget))
    );

    if (matched) {
      // Direct required concepts for this concept question: the concept itself + its immediate prerequisites
      const direct: RawConceptExtraction[] = [{ ...matched, isDirect: true }];
      if (matched.prerequisites) {
        for (const pName of matched.prerequisites) {
          const prereqObj = full.find(
            (c) => c.canonicalName.toLowerCase() === pName.toLowerCase()
          );
          if (prereqObj) {
            direct.push(prereqObj);
          } else {
            direct.push({
              canonicalName: pName,
              definition: `Prerequisite for ${matched.canonicalName}`,
              isAtomic: true,
              prerequisites: [],
            });
          }
        }
      }
      return direct;
    }

    return [
      {
        canonicalName: targetConcept?.canonicalName || targetName,
        definition: targetConcept?.definition || `Core concept ${targetName}`,
        topics: targetConcept?.topics || inferConceptTopics(targetName, targetConcept?.definition, question.topic),
        isAtomic: false,
        isDirect: true,
        prerequisites: targetConcept?.prerequisites || [],
      },
    ];
  }

  const direct = full.filter((c) => c.isDirect === true);
  return direct.length > 0 ? direct : full.slice(0, 2);
}

function getCuratedFrontierExpansion(
  frontier: RawConceptExtraction[],
  allKnownNames: string[]
): RawConceptExtraction[] {
  const allKnownSet = new Set(allKnownNames.map((n) => n.toLowerCase()));
  const neededNames = new Set<string>();

  for (const c of frontier) {
    if (c.prerequisites) {
      for (const p of c.prerequisites) {
        if (!allKnownSet.has(p.toLowerCase())) {
          neededNames.add(p.toLowerCase());
        }
      }
    }
  }

  const results: RawConceptExtraction[] = [];
  for (const list of Object.values(CURATED_SAMPLE_DAGS)) {
    for (const item of list) {
      const lower = item.canonicalName.toLowerCase();
      if (neededNames.has(lower) && !allKnownSet.has(lower)) {
        if (!results.some((r) => r.canonicalName.toLowerCase() === lower)) {
          results.push(item);
        }
      }
    }
  }

  return results;
}

/**
 * Extracts direct concepts from LLM or returns curated sample in demo mode.
 */
async function extractDirectConceptsLLM(
  question: Question,
  existingRegistry: Concept[],
  settings: UserSettings,
  isDemoUser: boolean,
  targetConcept?: Concept
): Promise<RawConceptExtraction[]> {
  if (isDemoUser || !settings.apiKey || !settings.apiKey.trim()) {
    return getCuratedDirectConcepts(question, targetConcept);
  }

  const prompt = getExtractConceptsUserPrompt(question, existingRegistry, targetConcept);

  if (settings.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: EXTRACT_CONCEPTS_SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_EXTRACT_CONCEPTS_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      console.warn('Gemini concept extraction error, using fallback:', response.statusText);
      return getCuratedSampleDAG(question, targetConcept);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return getCuratedSampleDAG(question, targetConcept);
    return extractJsonFromResponse<RawConceptExtraction[]>(text);
  }

  if (settings.provider === 'openai') {
    const isReasoning = settings.model.startsWith('o1') || settings.model.startsWith('o3');
    const reqBody: Record<string, unknown> = {
      model: settings.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: EXTRACT_CONCEPTS_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'extracted_concepts',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              concepts: EXTRACT_CONCEPTS_JSON_SCHEMA,
            },
            required: ['concepts'],
            additionalProperties: false,
          },
        },
      },
    };
    if (!isReasoning) reqBody.temperature = 0.2;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (!response.ok) {
      console.warn('OpenAI concept extraction error, using fallback:', response.statusText);
      return getCuratedSampleDAG(question, targetConcept);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return getCuratedSampleDAG(question, targetConcept);
    const parsed = extractJsonFromResponse<{ concepts: RawConceptExtraction[] }>(text);
    return parsed.concepts || [];
  }

  if (settings.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: settings.model || 'claude-3-5-sonnet-20241022',
        system: EXTRACT_CONCEPTS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        tools: [
          {
            name: 'return_extracted_concepts',
            description: 'Direct required concepts',
            input_schema: {
              type: 'object',
              properties: {
                concepts: EXTRACT_CONCEPTS_JSON_SCHEMA,
              },
              required: ['concepts'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'return_extracted_concepts' },
        max_tokens: 2048,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      console.warn('Anthropic concept extraction error, using fallback:', response.statusText);
      return getCuratedSampleDAG(question, targetConcept);
    }

    const data = await response.json();
    const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
    if (toolUse?.input?.concepts) {
      return toolUse.input.concepts as RawConceptExtraction[];
    }
    return getCuratedSampleDAG(question, targetConcept);
  }

  return getCuratedSampleDAG(question, targetConcept);
}

/**
 * Expands frontier prerequisites via LLM.
 */
async function expandFrontierLLM(
  frontier: RawConceptExtraction[],
  allKnownNames: string[],
  settings: UserSettings,
  isDemoUser: boolean
): Promise<RawConceptExtraction[]> {
  if (isDemoUser || !settings.apiKey || !settings.apiKey.trim()) {
    return getCuratedFrontierExpansion(frontier, allKnownNames);
  }

  const prompt = getExpandFrontierUserPrompt(
    frontier.map((c) => ({
      canonicalName: c.canonicalName,
      definition: c.definition,
      prerequisites: c.prerequisites || [],
    })),
    allKnownNames
  );

  try {
    if (settings.provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: EXTRACT_CONCEPTS_SYSTEM_PROMPT }] },
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_EXTRACT_CONCEPTS_SCHEMA,
          },
        }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return [];
      return extractJsonFromResponse<RawConceptExtraction[]>(text);
    }

    if (settings.provider === 'openai') {
      const isReasoning = settings.model.startsWith('o1') || settings.model.startsWith('o3');
      const reqBody: Record<string, unknown> = {
        model: settings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXTRACT_CONCEPTS_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'expanded_concepts',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                concepts: EXTRACT_CONCEPTS_JSON_SCHEMA,
              },
              required: ['concepts'],
              additionalProperties: false,
            },
          },
        },
      };
      if (!isReasoning) reqBody.temperature = 0.2;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(reqBody),
      });

      if (!response.ok) {
        console.warn('OpenAI concept expansion error:', response.statusText);
        return [];
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) return [];
      const parsed = extractJsonFromResponse<{ concepts: RawConceptExtraction[] }>(text);
      return parsed.concepts || [];
    }

    if (settings.provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: settings.model || 'claude-3-5-sonnet-20241022',
          system: EXTRACT_CONCEPTS_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
          tools: [
            {
              name: 'return_extracted_concepts',
              description: 'Prerequisite concepts expansion',
              input_schema: {
                type: 'object',
                properties: {
                  concepts: EXTRACT_CONCEPTS_JSON_SCHEMA,
                },
                required: ['concepts'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: 'return_extracted_concepts' },
          max_tokens: 2048,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        console.warn('Anthropic concept expansion error:', response.statusText);
        return [];
      }

      const data = await response.json();
      const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use');
      if (toolUse?.input?.concepts) {
        return toolUse.input.concepts as RawConceptExtraction[];
      }
      return [];
    }
  } catch (err) {
    console.warn('Error expanding frontier via LLM:', err);
  }

  return [];
}

/**
 * Implements the full DAG construction algorithm from next-steps.md:
 *
 * Generate Boss question
 *           ↓
 * Extract DIRECT required concepts
 *           ↓
 * Canonicalize against user's concept registry
 *           ↓
 * Remove concepts that are already in the registry
 *           ↓
 * Expand unresolved frontier
 *           ↓
 * Canonicalize again
 *           ↓
 * Repeat until atomic/mastered
 *           ↓
 *         DAG
 */
export async function buildQuestionDAG(
  question: Question,
  existingRegistry: Concept[],
  settings: UserSettings,
  isDemoUser: boolean,
  targetConcept?: Concept
): Promise<BuildDAGResult> {
  // Step 1: Extract DIRECT required concepts
  const rawDirect = await extractDirectConceptsLLM(
    question,
    existingRegistry,
    settings,
    isDemoUser,
    targetConcept
  );

  // Step 2 & 3: Canonicalize against user's registry and separate new vs existing
  const allKnownConceptsMap = new Map<string, RawConceptExtraction>();
  const directCanonicalPrereqs: string[] = [];

  // Track existing registered concepts for quick lookup
  const registeredByName = new Map<string, Concept>();
  for (const c of existingRegistry) {
    registeredByName.set(c.canonicalName.toLowerCase(), c);
    if (c.aliases) {
      for (const a of c.aliases) {
        registeredByName.set(a.toLowerCase(), c);
      }
    }
  }

  const newConceptsToExpand: RawConceptExtraction[] = [];

  for (const item of rawDirect) {
    const canonicalName = canonicalizeConceptName(item.canonicalName, existingRegistry);
    directCanonicalPrereqs.push(canonicalName);

    const isAlreadyInRegistry = registeredByName.has(canonicalName.toLowerCase());

    if (!isAlreadyInRegistry && !allKnownConceptsMap.has(canonicalName.toLowerCase())) {
      const normalizedTopics = normalizeConceptTopics(
        item.topics,
        canonicalName,
        item.definition,
        question.topic
      );
      const normalizedItem: RawConceptExtraction = {
        ...item,
        canonicalName,
        topics: normalizedTopics,
        prerequisites: (item.prerequisites || []).map((p) =>
          canonicalizeConceptName(p, existingRegistry)
        ),
      };
      allKnownConceptsMap.set(canonicalName.toLowerCase(), normalizedItem);
      newConceptsToExpand.push(normalizedItem);
    }
  }

  // Step 4, 5, 6: Expand unresolved frontier until atomic or mastered
  let frontier = [...newConceptsToExpand];
  let depth = 0;
  const MAX_DEPTH = 3;

  while (frontier.length > 0 && depth < MAX_DEPTH) {
    depth++;

    // Find frontier concepts that are NOT atomic and have prerequisites not yet known
    const needsExpansion = frontier.filter((c) => {
      if (c.isAtomic) return false;
      if (!c.prerequisites || c.prerequisites.length === 0) return false;
      return c.prerequisites.some((pName) => {
        const norm = pName.toLowerCase();
        return !registeredByName.has(norm) && !allKnownConceptsMap.has(norm);
      });
    });

    if (needsExpansion.length === 0) break;

    // Expand prerequisites for these concepts
    const allKnownNames = [
      ...existingRegistry.map((c) => c.canonicalName),
      ...Array.from(allKnownConceptsMap.values()).map((c) => c.canonicalName),
    ];

    const expanded = await expandFrontierLLM(
      needsExpansion,
      allKnownNames,
      settings,
      isDemoUser
    );

    const newlyDiscovered: RawConceptExtraction[] = [];

    for (const exp of expanded) {
      const canonical = canonicalizeConceptName(exp.canonicalName, existingRegistry);
      const isRegistered = registeredByName.has(canonical.toLowerCase());
      const isAlreadyDiscovered = allKnownConceptsMap.has(canonical.toLowerCase());

      if (!isRegistered && !isAlreadyDiscovered) {
        const normTopics = normalizeConceptTopics(
          exp.topics,
          canonical,
          exp.definition,
          question.topic
        );
        const normItem: RawConceptExtraction = {
          ...exp,
          canonicalName: canonical,
          topics: normTopics,
          prerequisites: (exp.prerequisites || []).map((p) =>
            canonicalizeConceptName(p, existingRegistry)
          ),
        };
        allKnownConceptsMap.set(canonical.toLowerCase(), normItem);
        newlyDiscovered.push(normItem);
      }
    }

    frontier = newlyDiscovered;
  }

  // Close any dangling prerequisites by creating foundational leaves so DAG has no unresolved external references
  for (const item of Array.from(allKnownConceptsMap.values())) {
    if (item.prerequisites && item.prerequisites.length > 0) {
      for (const pName of item.prerequisites) {
        const normP = pName.toLowerCase();
        if (!registeredByName.has(normP) && !allKnownConceptsMap.has(normP)) {
          allKnownConceptsMap.set(normP, {
            canonicalName: pName,
            definition: `Foundational principle of ${pName}.`,
            aliases: [],
            topics: inferConceptTopics(pName, undefined, question.topic),
            isAtomic: true,
            isDirect: false,
            prerequisites: [],
          });
        }
      }
    }
  }

  // Convert all newly discovered concepts to full Concept objects
  const finalNewConcepts: Concept[] = Array.from(allKnownConceptsMap.values()).map(
    (item) => {
      const isAtomic = Boolean(
        item.isAtomic && (!item.prerequisites || item.prerequisites.length === 0)
      );
      return {
        canonicalName: item.canonicalName,
        definition: item.definition || `Fundamental concept in ${question.topic}`,
        aliases: item.aliases || [],
        topics: normalizeConceptTopics(
          item.topics,
          item.canonicalName,
          item.definition,
          question.topic
        ),
        prerequisites: item.prerequisites || [],
        isAtomic,
        mastery: isAtomic ? 'mastered' : 'unseen',
        reasoningTrack: isAtomic ? createMasteredReasoningTrack() : createDefaultReasoningTrack(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  );

  // Check condition: Ask question only if all its prerequisites are at least proficient.
  // 1. If this is a Concept question (targetConcept or question.concept provided):
  //    The user is learning targetConcept, so targetConcept itself is not required to be proficient.
  //    HOWEVER, all direct required concepts OTHER than targetConcept must be proficient,
  //    and targetConcept's own prerequisites must all be proficient.
  // 2. If this is a Boss question (no targetConcept):
  //    All direct required concepts must be proficient.
  const targetConceptName = targetConcept?.canonicalName || question.concept;
  const prereqsToCheck = targetConceptName
    ? directCanonicalPrereqs.filter(
        (name) => name.toLowerCase() !== targetConceptName.toLowerCase()
      )
    : directCanonicalPrereqs;

  const targetPrereqsProficient = targetConcept
    ? areAllPrerequisitesProficient(targetConcept, existingRegistry)
    : true;

  const questionPrereqsProficient =
    prereqsToCheck.length === 0 ||
    prereqsToCheck.every((prereqName) => {
      const registered = findConcept(prereqName, existingRegistry);
      if (registered) {
        return (
          registered.isAtomic ||
          registered.mastery === 'proficient' ||
          registered.mastery === 'mastered'
        );
      }
      const newlyDiscovered = allKnownConceptsMap.get(prereqName.toLowerCase());
      if (
        newlyDiscovered &&
        newlyDiscovered.isAtomic &&
        (!newlyDiscovered.prerequisites || newlyDiscovered.prerequisites.length === 0)
      ) {
        return true;
      }
      return false;
    });

  const allPrerequisitesProficient = targetConceptName
    ? targetPrereqsProficient && questionPrereqsProficient
    : directCanonicalPrereqs.length > 0 && questionPrereqsProficient;

  return {
    newConcepts: finalNewConcepts,
    directPrerequisites: directCanonicalPrereqs,
    allPrerequisitesProficient,
  };
}

export async function buildBossQuestionDAG(
  bossQuestion: Question,
  existingRegistry: Concept[],
  settings: UserSettings,
  isDemoUser: boolean
): Promise<BuildDAGResult> {
  return buildQuestionDAG(bossQuestion, existingRegistry, settings, isDemoUser);
}
