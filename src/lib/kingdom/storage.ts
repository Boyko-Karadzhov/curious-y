import { Action, applyAction, Kingdom, newKingdom, parseKingdom } from './game';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';

const key = (userId: string) => `curious_y_phase1_v1_${userId}`;
const legacyKey = (userId: string) => `curious_y_kingdom_v1_${userId}`;
export const KINGDOM_CHANGED = 'curious-y-kingdom-changed';
export function loadKingdom(userId: string): Kingdom {
  const raw = localStorage.getItem(key(userId));
  if (raw !== null) return parseKingdom(raw);
  const legacy = localStorage.getItem(legacyKey(userId));
  if (legacy === null) return newKingdom();
  // Both pre-merge implementations used the legacy key, with incompatible shapes.
  // Read either format, then save future transactions under a dedicated Phase I key.
  let parsed;
  try { parsed = JSON.parse(legacy); }
  catch { return parseKingdom(legacy); }
  if (parsed?.version === 1) return parseKingdom(legacy);
  const validAmount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!parsed || !validAmount(parsed.gold) || !validAmount(parsed.castleLevel) || parsed.castleLevel < 1
    || typeof parsed.dayStamp !== 'string' || !parsed.knowledge
    || !KNOWLEDGE_RESOURCES.every(resource => validAmount(parsed.knowledge[resource.key]))) {
    throw new Error('Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.');
  }
  const state = newKingdom();
  state.gold = parsed.gold;
  state.castle = Math.min(5, parsed.castleLevel);
  for (const resource of KNOWLEDGE_RESOURCES) state.tokens[resource.topic] = parsed.knowledge[resource.key];
  return state;
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
  // Write the reset before removing the migration source so it cannot resurrect.
  localStorage.setItem(key(userId), JSON.stringify(newKingdom()));
  localStorage.removeItem(legacyKey(userId));
  window.dispatchEvent(new Event(KINGDOM_CHANGED));
}
