import { Action, applyAction, Kingdom, newKingdom, parseKingdom } from './game';

const key = (userId: string) => `curious_y_kingdom_v1_${userId}`;
export const KINGDOM_CHANGED = 'curious-y-kingdom-changed';
export function loadKingdom(userId: string): Kingdom {
  const raw = localStorage.getItem(key(userId));
  return raw === null ? newKingdom() : parseKingdom(raw);
}
export async function changeKingdom(userId: string, action: Action): Promise<Kingdom> {
  const commit = () => {
    const state = applyAction(loadKingdom(userId), action);
    try { localStorage.setItem(key(userId), JSON.stringify(state)); }
    catch { throw new Error('Castle progress could not be saved. Free browser storage and retry; this action has not been applied.'); }
    window.dispatchEvent(new Event(KINGDOM_CHANGED));
    return state;
  };
  // Serialize read-modify-write across tabs where Web Locks are available.
  return navigator.locks ? navigator.locks.request(key(userId), commit) : commit();
}
export function resetKingdom(userId: string) {
  localStorage.removeItem(key(userId));
  window.dispatchEvent(new Event(KINGDOM_CHANGED));
}
