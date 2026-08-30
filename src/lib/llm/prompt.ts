import { Question } from '../../types';
import { DEFAULT_SUBTOPIC_EXPLORATIONS } from './subtopics';

export const QUESTION_SYSTEM_PROMPT = `You are an expert tutor creating engaging, unique, and deeply insightful microlearning questions.
Your task is to generate ONE single, high-quality, thought-provoking multiple-choice question starting with "Why" (e.g., "Why does...", "Why is...", "Why do...", "Why did...").

Guidelines:
1. Topic Focus: Focus strictly on the requested topic and the specific subtopic/angle provided in the prompt.
2. Novelty & Diversity: Avoid repetitive canonical questions (like astronauts on the ISS, why the sky is blue, or standard textbook cliches). Explore rich, diverse concepts within the topic.
3. Question Format: The question text MUST start with "Why".
4. Options: Provide exactly 4 plausible, well-crafted options (A, B, C, D) of similar length.
5. Correct Answer: Exactly one option must be unequivocally correct based on first principles.
6. Common Misconceptions: The 3 incorrect distractors should reflect genuine, common misconceptions rather than obviously absurd choices.
7. Explanation: Provide a clear, intuitive, and educational explanation of why the correct answer is right and the physical/mathematical intuition behind it.
8. LaTeX formatting: When math, chemical formulas, or scientific equations are involved, format them using valid LaTeX enclosed in single dollar signs $...$ for inline or double dollar signs $$...$$ for display math (e.g. $E = mc^2$, $\\int_0^\\infty e^{-x} dx$, $\\text{H}_2\\text{O}$, $\\lim_{h \\to 0}$).
9. Angle & Subtopic Reflection: Explicitly include the chosen subtopic, angle, and a concise 1-2 sentence explanation ("angleFit") of how the question specifically embodies and explores the requested exploration angle.

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
  "explanation": "Detailed explanation with LaTeX if needed."
}`;

export const ANGLES = [
  'Focus on a surprising or counter-intuitive mechanism that challenges everyday assumptions.',
  'Focus on a deep underlying first principle or rigorous mathematical derivation.',
  'Focus on how microscopic molecular/atomic or foundational principles govern macroscopic observations.',
  'Focus on a pivotal historical discovery or thought experiment.',
  'Focus on a real-world technological or natural phenomenon explained by fundamental laws.',
  'Focus on resolving a classic paradox or widespread conceptual misconception in the field.'
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
  const chosenTopic = specificTopic || topics[Math.floor(Math.random() * topics.length)] || 'Physics';

  // Sample a subtopic from custom provided list or default catalog
  const subtopicList =
    customSubtopics && customSubtopics.length > 0
      ? customSubtopics
      : DEFAULT_SUBTOPIC_EXPLORATIONS[chosenTopic] || [
          `core principles and foundational mechanisms of ${chosenTopic}`,
          `counter-intuitive paradoxes and unexpected phenomena in ${chosenTopic}`,
          `real-world technologies and natural phenomena in ${chosenTopic}`,
        ];

  const subtopicFocus = subtopicList[Math.floor(Math.random() * subtopicList.length)];
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

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

  prompt += `\n\nReturn ONLY a valid JSON object matching the required schema (including topic, subtopic, angle, angleFit, question, options, correctIndex, explanation).`;

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
3. Use LaTeX for math and formulas with $...$ (inline) or $$...$$ (display math) whenever relevant.
4. Keep a friendly, encouraging, and intellectually stimulating tone.`;
};

/**
 * Extracts and parses a JSON object from LLM response text,
 * stripping markdown code fences or extraneous leading/trailing text.
 */
export function extractJsonFromResponse<T>(rawText: string): T {
  let cleaned = rawText.trim();
  
  // Remove markdown code blocks if present (```json ... ``` or ``` ...)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // If no explicit code block, find first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error('Failed to parse JSON from LLM response:', rawText, err);
    throw new Error('The LLM returned an invalid response format. Please try again.');
  }
}
