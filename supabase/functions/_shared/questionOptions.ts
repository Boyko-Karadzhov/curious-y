/**
 * Randomly shuffles the options of a question using the Fisher-Yates algorithm
 * and updates correctIndex so that the correct answer remains intact at its new location.
 */
export function shuffleQuestionOptions<T extends { options: string[]; correctIndex: number }>(question: T): T {
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
