import { Question } from '../../types';

const key = (userId: string) => `curious_y_pending_reward_${userId}`;
export function loadPendingReward(userId: string): Question | null {
  const raw = localStorage.getItem(key(userId));
  return raw ? JSON.parse(raw) as Question : null;
}
export function savePendingReward(userId: string, question: Question) {
  localStorage.setItem(key(userId), JSON.stringify(question));
}
export function clearPendingReward(userId: string) {
  localStorage.removeItem(key(userId));
}
