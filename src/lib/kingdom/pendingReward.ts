import { createLearningReward } from '../../../supabase/functions/_shared/resources';
import { Question } from '../../types';

const key = (userId: string) => `curious_y_pending_reward_${userId}`;
export function loadPendingReward(userId: string): Question | null {
  const raw = localStorage.getItem(key(userId));
  if (!raw) return null;
  const question = JSON.parse(raw) as Question;
  // One-time upgrade of old Demo obligations: they promised only the original topic.
  if (!question.reward) {
    question.reward = createLearningReward(question.id!, question.isCorrect === true, null, question.topic);
    savePendingReward(userId, question);
  }
  return question;
}
export function savePendingReward(userId: string, question: Question) {
  localStorage.setItem(key(userId), JSON.stringify(question));
}
export function clearPendingReward(userId: string) {
  localStorage.removeItem(key(userId));
}
