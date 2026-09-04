import { Question } from '../../types';
import { getSubtopicsForTopic } from './subtopics';

export const QUESTION_SYSTEM_PROMPT = `You are an expert tutor creating engaging, unique, and deeply insightful microlearning questions.
Your task is to generate ONE single, high-quality, thought-provoking multiple-choice question starting with "Why" (e.g., "Why does...", "Why is...", "Why do...", "Why did...").

Guidelines:
1. Topic Focus: Focus strictly on the requested topic and the specific subtopic/angle provided in the prompt.
2. Novelty & Diversity: Avoid repetitive canonical questions (like astronauts on the ISS, why the sky is blue, or standard textbook cliches). Explore rich, diverse concepts within the topic.
3. Question Format: The question text MUST start with "Why".
4. Options: Provide exactly 4 plausible, well-crafted options (A, B, C, D) of similar length.
5. Correct Answer: Exactly one option must be unequivocally correct based on first principles. Place the correct answer randomly among A, B, C, or D (do not always place it as option A).
6. Common Misconceptions: The 3 incorrect distractors should reflect genuine, common misconceptions rather than obviously absurd choices.
7. Explanation: Provide a clear, intuitive, and educational explanation of why the correct answer is right and the physical/mathematical intuition behind it.
8. Mathematical & Scientific Notation: When math, chemical formulas, or scientific equations are involved, format them using standard notation enclosed in single dollar signs $...$ for inline or double dollar signs $$...$$ for display math (e.g. $E = mc^2$, $\\int_0^\\infty e^{-x} dx$, $\\text{H}_2\\text{O}$, $\\lim_{h \\to 0}$).
9. Angle & Subtopic Reflection: Explicitly include the chosen subtopic, angle, and a concise 1-2 sentence explanation ("angleFit") of how the question specifically embodies and explores the requested exploration angle.
10. Suggested Questions: Provide an array "suggestedQuestions" of 3-4 specific follow-up questions directly related to this question. Each suggested question MUST ask about specific key terms, physical/conceptual mechanisms, mathematical formulas/quantities, or causal relations mentioned in the question, correct answer, and explanation (e.g. asking how term A relates to term B, what happens if variable X changes, why relation Y holds, or clarifying the exact role of concept Z).

You MUST reply ONLY with a valid JSON object in the following format (no surrounding markdown text or explanations outside JSON):
{
  "topic": "Topic Name",
  "subtopic": "Subtopic Focus provided in prompt",
  "angle": "Exploration Angle provided in prompt",
  "angleFit": "1-2 sentence explanation of why and how this question fits the chosen angle and subtopic.",
  "question": "Why does...?",
  "options": [
    "Option A text",
    "Option B text",
    "Option C text",
    "Option D text"
  ],
  "correctIndex": 0,
  "explanation": "Detailed explanation with clear reasoning.",
  "suggestedQuestions": [
    "How does [Term A] relate to [Term B] in this context?",
    "What would happen if [Term/Variable] were altered?",
    "Why is [Key Term] crucial for [Relation/Phenomenon]?"
  ]
}`;

/**
 * Standard JSON Schema for Questions (OpenAI Strict Structured Outputs & Anthropic Tool Use)
 */
export const QUESTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: 'The overarching domain or subject.' },
    subtopic: { type: 'string', description: 'The specific subtopic focus.' },
    angle: { type: 'string', description: 'The exploration angle applied.' },
    angleFit: { type: 'string', description: '1-2 sentences explaining how question fits the angle.' },
    question: { type: 'string', description: 'The "Why" question text.' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exactly 4 plausible multiple-choice options.',
    },
    correctIndex: { type: 'integer', description: '0-based index (0 to 3) of the correct option.' },
    explanation: { type: 'string', description: 'Clear pedagogical explanation with physical/mathematical reasoning.' },
    suggestedQuestions: {
      type: 'array',
      items: { type: 'string' },
      description: '3-4 specific follow-up questions exploring terms and mechanisms.',
    },
  },
  required: [
    'topic',
    'subtopic',
    'angle',
    'angleFit',
    'question',
    'options',
    'correctIndex',
    'explanation',
    'suggestedQuestions',
  ],
  additionalProperties: false,
} as const;

/**
 * Gemini-specific Schema format for responseSchema
 */
export const GEMINI_QUESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    topic: { type: 'STRING' },
    subtopic: { type: 'STRING' },
    angle: { type: 'STRING' },
    angleFit: { type: 'STRING' },
    question: { type: 'STRING' },
    options: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
    correctIndex: { type: 'INTEGER' },
    explanation: { type: 'STRING' },
    suggestedQuestions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: [
    'topic',
    'subtopic',
    'angle',
    'angleFit',
    'question',
    'options',
    'correctIndex',
    'explanation',
    'suggestedQuestions',
  ],
} as const;

export const ANGLES = [
  'Counterintuitive mechanism — why reality differs from intuition',
  'First principles — explain from fundamental rules',
  'Micro → macro — how lower-level behavior produces emergence',
  'Paradox / apparent contradiction — reconcile conflicting-looking facts',
  'Real-world phenomenon — explain something observable or practical',
  'Historical discovery — why an idea was needed / how thinking changed',
  'Boundary / failure case — where a model stops working and why',
  'Deep connection — reveal an unexpected connection between concepts',
];

export interface QuestionPromptContext {
  prompt: string;
  topic: string;
  subtopic: string;
  angle: string;
}

export const getQuestionPromptContext = (
  topics: string[],
  specificTopic?: string,
  recentQuestions: string[] = [],
  customSubtopics?: string[]
): QuestionPromptContext => {
  const chosenTopic =
    specificTopic ||
    topics[Math.floor(Math.random() * topics.length)] ||
    'Physics';

  const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Sample a subtopic from provided list or catalog
  const subtopicList =
    customSubtopics && customSubtopics.length > 0
      ? customSubtopics
      : getSubtopicsForTopic(chosenTopic);

  const subtopicFocus = subtopicList[Math.floor(Math.random() * subtopicList.length)];
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];

  let prompt = `Generate a brand-new, unique "Why" microlearning multiple-choice question for:
- Topic: "${chosenTopic}"
- Subtopic Focus: "${subtopicFocus}"
- Exploration Angle: ${angle}
- Random Session Entropy: [${nonce}]`;

  if (recentQuestions && recentQuestions.length > 0) {
    const questionsToAvoid = recentQuestions.slice(0, 8).map((q) => `  - "${q}"`).join('\n');
    prompt += `\n\nCRITICAL DIVERSITY RULE:
Do NOT repeat or make a variation of any of these recently asked questions:
${questionsToAvoid}

Choose a completely different concept and angle!`;
  }

  prompt += `\n\nReturn ONLY a valid JSON object matching the required schema (including topic, subtopic, angle, angleFit, question, options, correctIndex, explanation, suggestedQuestions). Ensure any LaTeX backslashes are properly escaped as \\\\ (e.g. \\\\Delta, \\\\frac).`;

  return { prompt, topic: chosenTopic, subtopic: subtopicFocus, angle };
};

export const getQuestionUserPrompt = (
  topics: string[],
  specificTopic?: string,
  recentQuestions: string[] = [],
  customSubtopics?: string[]
): string => {
  return getQuestionPromptContext(topics, specificTopic, recentQuestions, customSubtopics).prompt;
};

export const getChatSystemPrompt = (questionContext: Question): string => {
  const subtopicLine = questionContext.subtopic ? `- Subtopic: ${questionContext.subtopic}\n` : '';
  const angleLine = questionContext.angle ? `- Exploration Angle: ${questionContext.angle}\n` : '';
  const angleFitLine = questionContext.angleFit ? `- How Question Fits Angle: ${questionContext.angleFit}\n` : '';

  return `You are Curious-Y, an enthusiastic, insightful, and pedagogical AI tutor helping a student learn deeply.

Current Learning Context:
- Topic: ${questionContext.topic}
${subtopicLine}${angleLine}${angleFitLine}- Question: ${questionContext.questionText}
- Options:
  0) ${questionContext.options[0]}
  1) ${questionContext.options[1]}
  2) ${questionContext.options[2]}
  3) ${questionContext.options[3]}
- Correct Option: Option ${String.fromCharCode(65 + questionContext.correctIndex)} ("${questionContext.options[questionContext.correctIndex]}")
- Explanation: ${questionContext.explanation}

Instructions:
1. Answer the student's follow-up questions thoughtfully, clearly, and concisely.
2. Build on the concepts presented in the question, angle context, and explanation.
3. Format math and formulas with $...$ (inline) or $$...$$ (display math) whenever relevant.
4. Keep a friendly, encouraging, and intellectually stimulating tone.`;
};

/**
 * Extracts and parses a JSON object from LLM response text,
 * stripping markdown code fences or extraneous leading/trailing text.
 */
export function extractJsonFromResponse<T>(rawText: string): T {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('The LLM returned an invalid response format. Please try again.');
  }

  let cleaned = rawText.trim();

  // Strip markdown code blocks if present (```json ... ``` or ``` ...)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // If no explicit code block, find outer '{' and '}' or '[' and ']'
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    } else if (firstBracket !== -1) {
      const lastBracket = cleaned.lastIndexOf(']');
      if (lastBracket > firstBracket) {
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
      }
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error('Failed to parse JSON from LLM response:', rawText, err);
    throw new Error('The LLM returned an invalid response format. Please try again.');
  }
}

/**
 * Randomly shuffles the options of a question using the Fisher-Yates algorithm
 * and updates correctIndex so that the correct answer remains intact at its new location.
 */
export function shuffleQuestionOptions(question: Question): Question {
  if (!question.options || question.options.length <= 1) {
    return question;
  }

  const validCorrectIndex =
    typeof question.correctIndex === 'number' &&
    question.correctIndex >= 0 &&
    question.correctIndex < question.options.length
      ? question.correctIndex
      : 0;

  // Track original indices [0, 1, ..., n-1]
  const indices = question.options.map((_, i) => i);

  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }

  const shuffledOptions = indices.map((origIdx) => question.options[origIdx]);
  const newCorrectIndex = indices.indexOf(validCorrectIndex);

  return {
    ...question,
    options: shuffledOptions,
    correctIndex: newCorrectIndex,
  };
}

