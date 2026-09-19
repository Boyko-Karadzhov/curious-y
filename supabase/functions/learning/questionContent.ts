import { nonempty, objectSchema, stringSchema, stringsSchema, validMarkdown } from './structured.ts';

export type AnswerChoice = {
    text: string;
    feedback: string
};
export type QuestionContent = {
    question: string;
    correctAnswer: AnswerChoice;
    wrongAnswers: AnswerChoice[];
    explanation: string;
    suggestedQuestions: string[];
};
const choiceSchema = objectSchema({
    text: stringSchema,
    feedback: stringSchema
});
export const questionSchema = objectSchema({
    question: stringSchema,
    // Generate the worked solution before choosing the answer and distractors.
    explanation: stringSchema,
    correctAnswer: choiceSchema,
    wrongAnswers: {
        type: 'ARRAY',
        items: choiceSchema,
        minItems: 3,
        maxItems: 3
    },
    suggestedQuestions: {
        ...stringsSchema,
        maxItems: 3
    },
});
export const ANSWER_RULE = `Return correctAnswer as one {text, feedback} object and wrongAnswers as exactly three {text, feedback} objects. Give four plausible mutually exclusive options, one correct. Wrong answers represent distinct misconceptions. No option letters, positions, all/none of the above, length clues or answer indices; the server shuffles the choices. Use a short concrete reasoning task, without a lecture in the stem. Explanation and feedback appear after answering: show only essential reasoning, with 1-2 sentences of specific feedback per choice. Limits: question 1600 characters, explanation 8000, each answer text 600, each feedback 1400. suggestedQuestions contains zero to three follow-ups, at most 300 characters each. Return every requested JSON field.`;
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
export class JourneyQuestionError extends Error {}

function validateChoices(q: QuestionContent): void {
    if (!Array.isArray(q.wrongAnswers) || q.wrongAnswers.length !== 3) {
        throw new JourneyQuestionError('wrongAnswers must contain exactly three choices.');
    }

    const choices = [q.correctAnswer, ...q.wrongAnswers];
    if (choices.some(choice => !choice || !validMarkdown(choice.text, 600) || !validMarkdown(choice.feedback, 1400))) {
        throw new JourneyQuestionError('Every answer needs text and aligned feedback, with correctly JSON-escaped LaTeX backslashes.');
    }

    if (new Set(choices.map(choice => normalize(choice.text))).size !== 4) {
        throw new JourneyQuestionError('Supply four distinct answers.');
    }
}

export function validateQuestionContent(value: unknown): QuestionContent {
    const q = value as QuestionContent;
    if (!q || !validMarkdown(q.question, 1600) || !validMarkdown(q.explanation, 8000)) {
        throw new JourneyQuestionError('Invalid question or explanation. Check lengths and JSON-escaped LaTeX backslashes.');
    }

    validateChoices(q);
    if (!Array.isArray(q.suggestedQuestions) || q.suggestedQuestions.length > 3 || q.suggestedQuestions.some(s => !nonempty(s, 300))) {
        throw new JourneyQuestionError('Invalid suggestedQuestions.');
    }

    return q;
}

export function validateJourneyQuestion(value: unknown, history: string[]): QuestionContent {
    const q = validateQuestionContent(value);
    if (history.some(old => normalize(old) === normalize(q.question))) {
        throw new JourneyQuestionError('Use a new example, not a repeated question. Change the setting and reasoning task.');
    }

    return q;
}

export function shuffledQuestion(question: QuestionContent, revealedEntry?: string, random = Math.random) {
    const choices = [question.correctAnswer, ...question.wrongAnswers];
    for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
    }

    return {
        question_text: question.question,
        options: choices.map(choice => choice.text),
        correct_index: choices.indexOf(question.correctAnswer),
        option_feedback: choices.map(choice => choice.feedback),
        explanation: question.explanation,
        ...(revealedEntry ? { knowledge_entry: revealedEntry } : {}),
        suggested_questions: question.suggestedQuestions,
    };
}
