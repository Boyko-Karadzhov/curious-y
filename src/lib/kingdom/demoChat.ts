import type { Question } from '../../types';

export function demoChatReply(question: Question): string {
    return `**Great question about ${question.topic}!**\n\nExplorer mode uses a short built-in explanation. Sign in to use the server-hosted Gemini tutor.\n\nThe core principle here is: *${question.explanation}*`;
}
