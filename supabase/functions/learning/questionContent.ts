import { nonempty, objectSchema, stringSchema, stringsSchema } from './structured.ts';

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
    correctAnswer: choiceSchema,
    wrongAnswers: {
        type: 'ARRAY',
        items: choiceSchema,
        minItems: 3,
        maxItems: 3
    },
    explanation: stringSchema,
    suggestedQuestions: {
        ...stringsSchema,
        maxItems: 3
    },
});
export const ANSWER_RULE = `Return correctAnswer as one {text, feedback} object and wrongAnswers as exactly three {text, feedback} objects. Never mix right and wrong answers in one array or supply option indices. Wrong answers must reflect distinct plausible misconceptions. No option letters, positions, all/none of the above, or length clues. Explain each choice in its feedback. The server shuffles answers and their feedback together. Use plain language, a short concrete reasoning task, and one unambiguous correct answer. No lecture before the options. Explanation and feedback appear AFTER a choice. Include an explanation (at most 8000 characters), question (at most 1600), answer texts (at most 600), feedback (at most 1400), and zero to three suggestedQuestions (at most 300 each).`;
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
export class JourneyQuestionError extends Error {}

function validateChoices(q: QuestionContent): void {
    if (!Array.isArray(q.wrongAnswers) || q.wrongAnswers.length !== 3) {
        throw new JourneyQuestionError('wrongAnswers must contain exactly three choices.');
    }

    const choices = [q.correctAnswer, ...q.wrongAnswers];
    if (choices.some(choice => !choice || !nonempty(choice.text, 600) || !nonempty(choice.feedback, 1400))) {
        throw new JourneyQuestionError('Every answer needs text and aligned feedback.');
    }

    if (new Set(choices.map(choice => normalize(choice.text))).size !== 4) {
        throw new JourneyQuestionError('Supply four distinct answers.');
    }
}

export function validateQuestionContent(value: unknown): QuestionContent {
    const q = value as QuestionContent;
    if (!q || !nonempty(q.question, 1600) || !nonempty(q.explanation, 8000)) {
        throw new JourneyQuestionError('Invalid question or explanation.');
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
