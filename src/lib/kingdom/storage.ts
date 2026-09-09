import { claimTribute, refreshTribute, Action, applyAction, settleBattle, Kingdom, newKingdom, parseKingdom } from './game';
import { KNOWLEDGE_RESOURCES } from '../../game/economy';
import { loadPendingReward, clearPendingReward } from './pendingReward';
import { demoLibraryConcepts } from './demoLearning';
import { reconcileLibrary } from '../../../supabase/functions/_shared/library';

const key = (userId: string) => `curious_y_phase1_v1_${userId}`;
const legacyKey = (userId: string) => `curious_y_kingdom_v1_${userId}`;
export const KINGDOM_CHANGED = 'curious-y-kingdom-changed';
export function loadKingdom(userId: string): Kingdom {
    return reconcileLibrary(loadStoredKingdom(userId), demoLibraryConcepts(userId));
}
function loadStoredKingdom(userId: string): Kingdom {
    const raw = localStorage.getItem(key(userId));
    if (raw !== null) return parseKingdom(raw);
    const legacy = localStorage.getItem(legacyKey(userId));
    if (legacy === null) return newKingdom();
    // Both pre-merge implementations used the legacy key, with incompatible shapes.
    // Read either format, then save future transactions under a dedicated Phase I key.
    let parsed;
    try { parsed = JSON.parse(legacy); }
    catch { return parseKingdom(legacy); }
    if ([1, 2, 3, 4, 5, 6, 7].includes(parsed?.version)) return parseKingdom(legacy);
    const validAmount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    if (!parsed || !validAmount(parsed.gold) || !validAmount(parsed.castleLevel) || parsed.castleLevel < 1
    || typeof parsed.dayStamp !== 'string' || !parsed.knowledge
    || !KNOWLEDGE_RESOURCES.every(resource => validAmount(parsed.knowledge[resource.key]))) {
        throw new Error('Castle save could not be read. Your stored data has been preserved. Use Reset Progress only if you want to start over.');
    }
    const state = newKingdom();
    state.gold = parsed.gold;
    state.lifetimeGold = parsed.gold;
    state.castle = Math.min(5, parsed.castleLevel);
    for (const resource of KNOWLEDGE_RESOURCES) state.tokens[resource.topic] = parsed.knowledge[resource.key];
    return state;
}
export async function changeKingdom(userId: string, action: Action, requestId: string = crypto.randomUUID(), generation?: string): Promise<Kingdom> {
    const commit = () => {
        const current = loadKingdom(userId);
        const epoch = demoGeneration(userId);
        if (generation !== undefined && epoch !== generation) throw new Error('Progress was reset; refresh your Castle.');
        const envelopeRaw = localStorage.getItem(key(userId));
        const stored = envelopeRaw ? JSON.parse(envelopeRaw) : null;
        const receipts = stored?.demoReceipts ?? {};
        const prior = receipts[requestId];
        if (prior) {
            if (prior.command !== JSON.stringify(action)) throw new Error('Command ID was already used.');
            return { ...current, lastResult: prior.result?.recruits ? prior.result : current.lastResult };
        }
        if (action.type === 'answer' && action.reward && !current.rewarded.includes(action.id)) {
            const pending = loadPendingReward(userId);
            if (pending?.id !== action.id || JSON.stringify(pending.reward) !== JSON.stringify(action.reward)) {
                throw new Error('Reward not found or progress was reset.');
            }
        }
        const draws = Array.from(crypto.getRandomValues(new Uint32Array(action.type === 'forge' || action.type === 'recruit' ? 6 : 3)), n => n / 4294967296);
        let state = applyAction(current, action, { requestId, draws, awardTribute: false });
        if (action.type === 'start') {
      state.battle!.id = requestId;
      state.battle!.seed = Math.floor(draws[0] * 4294967296);
      state = settleBattle(state);
        }
        if (action.type !== 'tick') receipts[requestId] = { command: JSON.stringify(action), result: action.type === 'recruit' ? state.lastResult : null };
        try { localStorage.setItem(key(userId), JSON.stringify({ ...state, demoGeneration: epoch, demoReceipts: receipts })); }
        catch { throw new Error('Castle progress could not be saved. Free browser storage and retry; this action has not been applied.'); }
        // Cleanup shares the answer/reset lock, and a late retry cannot clear another receipt.
        if (action.type === 'answer' && action.reward) clearPendingReward(userId, action.id);
        window.dispatchEvent(new Event(KINGDOM_CHANGED));
        return state;
    };
    // Serialize read-modify-write across tabs where Web Locks are available.
    return navigator.locks ? navigator.locks.request(key(userId), commit) : commit();
}
export function resetKingdom(userId: string) {
    // Write the reset before removing the migration source so it cannot resurrect.
    localStorage.setItem(key(userId), JSON.stringify({ ...newKingdom(), demoGeneration: crypto.randomUUID() }));
    localStorage.removeItem(legacyKey(userId));
    window.dispatchEvent(new Event(KINGDOM_CHANGED));
}

export const demoGeneration = (userId: string): string => {
    const raw = localStorage.getItem(key(userId));
    return (raw ? JSON.parse(raw)?.demoGeneration : undefined) ?? localStorage.getItem(`${key(userId)}_generation`) ?? '0';
};

// Called under the same Demo account lock as answer submission. Retrying the
// saved answer repairs a failed local write without paying twice or on a later day.
export function recordDemoCorrect(userId: string, answeredAt: string) {
    if (answeredAt.slice(0, 10) !== new Date().toISOString().slice(0, 10)) return;
    const raw = localStorage.getItem(key(userId));
    const envelope = raw ? JSON.parse(raw) : {};
    const state = loadKingdom(userId);
    refreshTribute(state, answeredAt); state.tribute.correct = true; claimTribute(state);
    localStorage.setItem(key(userId), JSON.stringify({ ...envelope, ...state }));
    window.dispatchEvent(new Event(KINGDOM_CHANGED));
}
