import { Question } from '../../types';

export const QUESTION_SYSTEM_PROMPT = `You are an expert tutor creating engaging microlearning questions.
Your task is to generate ONE single, high-quality, thought-provoking multiple-choice question starting with "Why" (e.g., "Why does...", "Why is...", "Why do...", "Why did...").

Guidelines:
1. Topic: Focus strictly on the requested topic.
2. Question Format: The question text MUST start with "Why".
3. Options: Provide exactly 4 plausible options (A, B, C, D).
4. Correct Answer: Exactly one option must be unequivocally correct.
5. Explanation: Provide a clear, intuitive, and educational explanation of why the correct answer is right and why the common misconception is wrong.
6. LaTeX formatting: When math, chemical formulas, or scientific equations are involved, format them using valid LaTeX enclosed in single dollar signs $...$ for inline or double dollar signs $$...$$ for display math (e.g. $E = mc^2$, $\\int_0^\\infty e^{-x} dx$, $\\text{H}_2\\text{O}$).

You MUST reply ONLY with a valid JSON object in the following format (no surrounding explanation text):
{
  "topic": "Topic Name",
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

export const getQuestionUserPrompt = (topics: string[], specificTopic?: string): string => {
  const chosenTopic = specificTopic || topics[Math.floor(Math.random() * topics.length)] || 'Physics';
  return `Generate a "Why" microlearning multiple-choice question for the topic: "${chosenTopic}". Return ONLY valid JSON.`;
};

export const getChatSystemPrompt = (questionContext: Question): string => {
  return `You are Curious-Y, an enthusiastic, insightful, and pedagogical AI tutor helping a student learn deeply.

Current Learning Context:
- Topic: ${questionContext.topic}
- Question: ${questionContext.questionText}
- Options:
  0) ${questionContext.options[0]}
  1) ${questionContext.options[1]}
  2) ${questionContext.options[2]}
  3) ${questionContext.options[3]}
- Correct Option: Option ${String.fromCharCode(65 + questionContext.correctIndex)} ("${questionContext.options[questionContext.correctIndex]}")
- Explanation: ${questionContext.explanation}

Instructions:
1. Answer the student's follow-up questions thoughtfully, clearly, and concisely.
2. Build on the concepts presented in the question and explanation.
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
