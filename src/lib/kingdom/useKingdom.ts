import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, battleSpeed, BATTLE_RULES, CURRENT_RULES, Kingdom, KingdomSnapshot, newKingdom, parseKingdom } from './game';
import { changeKingdom, demoGeneration, KINGDOM_CHANGED, loadKingdom } from './storage';
import { commandServerKingdom, getServerKingdom } from '../../services/backend';
import { LearningRequestError } from '../../services/learningErrors';
import { useBattlePlayback } from './useBattlePlayback';

export function useKingdom(userId?: string, isDemoUser = false) {
  const serverBacked = !!userId && !isDemoUser;
  const [state, setState] = useState<Kingdom>(newKingdom);
  const playback = useBattlePlayback(state, userId);
  const skipPlayback = playback.skip;
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(true);
  const snapshot = useRef<KingdomSnapshot | null>(null);
  const identity = useRef(userId);
  identity.current = userId;
  const pending = useRef<{ key: string; id: string; generation: number; demoEpoch?: string } | null>(null);
  const inFlight = useRef(false);
  const applyServer = useCallback((next: KingdomSnapshot) => {
    if (identity.current !== userId) return;
    if (snapshot.current && (next.generation < snapshot.current.generation || next.revision < snapshot.current.revision)) return;
    const converted = { ...next, state: parseKingdom(JSON.stringify({ ...next.state, lastResult: next.result ?? next.state.lastResult })) };
    if (pending.current && pending.current.generation !== next.generation) {
      pending.current = null;
      try { localStorage.removeItem(`curious_y_pending_command_${userId}`); } catch { /* Snapshot generation still rejects the old request. */ }
    }
    snapshot.current = converted;
    setState(converted.state); setUnavailable(false); setError(pending.current ? 'A Castle action is awaiting confirmation. Retry it to recover the committed result.' : null);
  }, [userId]);
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      if (serverBacked) {
        const next = await getServerKingdom();
        if (identity.current !== userId) return;
        applyServer(next);
      } else { setState(loadKingdom(userId)); setUnavailable(false); setError(null); }
    } catch (e) {
      if (identity.current !== userId) return;
      setUnavailable(true); setError(e instanceof Error ? e.message : 'Castle is unavailable.');
    }
  }, [userId, serverBacked, applyServer]);
  useEffect(() => {
    snapshot.current = null;
    const saved = userId && localStorage.getItem(`curious_y_pending_command_${userId}`);
    try { pending.current = saved ? JSON.parse(saved) : null; } catch { pending.current = null; }
    setState(newKingdom()); setUnavailable(true);
    void refresh();
    const onRefresh = () => { void refresh(); };
    window.addEventListener('focus', onRefresh);
    window.addEventListener(KINGDOM_CHANGED, onRefresh);
    if (!serverBacked) window.addEventListener('storage', onRefresh);
    return () => {
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener(KINGDOM_CHANGED, onRefresh);
      window.removeEventListener('storage', onRefresh);
    };
  }, [refresh, serverBacked, userId]);
  const act = useCallback(async (action: Action) => {
    if (action.type === 'retreat' && skipPlayback()) return true;
    if (!userId || inFlight.current) return false;
    inFlight.current = true;
    try {
      const key = JSON.stringify(action);
      if (pending.current && pending.current.key !== key) throw new Error('Retry the previous Castle action before making another change.');
      pending.current ??= { key, id: crypto.randomUUID(), generation: snapshot.current?.generation ?? 0, demoEpoch: demoGeneration(userId) };
      try { localStorage.setItem(`curious_y_pending_command_${userId}`, JSON.stringify(pending.current)); } catch { throw new Error('Castle progress could not be saved. Free browser storage and retry; this action has not been applied.'); }
      let committedResult: Kingdom['lastResult'] = null;
      if (!serverBacked) { const saved = await changeKingdom(userId, action, pending.current.id, pending.current.demoEpoch); setState(saved); committedResult = saved.lastResult; }
      else {
        if (action.type === 'answer') throw new Error('Learning rewards can only be issued by the answer service.');
        if (!snapshot.current) throw new Error('Reload your Castle before making changes.');
        const next = await commandServerKingdom(action, pending.current.generation, pending.current.id);
        if (identity.current !== userId) return false;
        applyServer(next); committedResult = next.result ?? next.state.lastResult;
      }
      pending.current = null;
      try { localStorage.removeItem(`curious_y_pending_command_${userId}`); } catch { /* A saved receipt makes recovery safe. */ }
      if (action.type === 'recruit' && committedResult) window.dispatchEvent(new CustomEvent('curious-y-roster-result', {detail:committedResult}));
      setError(null);
      return true;
    } catch (e) {
      if (identity.current !== userId) return false;
      if (!serverBacked || e instanceof LearningRequestError && e.httpStatus && e.httpStatus >= 400 && e.httpStatus < 500) {
        pending.current = null; localStorage.removeItem(`curious_y_pending_command_${userId}`);
      }
      setError(e instanceof Error ? e.message : 'Castle action failed. Please retry.');
      return false;
    } finally { inFlight.current = false; }
  }, [userId, serverBacked, applyServer, skipPlayback]);
  // Compatibility only for saves made before battles settled during Start.
  // New battles never send ticks or write playback frames to browser storage.
  const activeBattle = !!state.battle && !state.battle.id && !state.battle.result;
  const demoStepMs = (state.battle?.config.stepSeconds ?? BATTLE_RULES[CURRENT_RULES].stepSeconds) * 1000 / battleSpeed(state.battle?.config.rulesVersion ?? CURRENT_RULES);
  useEffect(() => {
    if (!userId || !activeBattle || unavailable) return;
    // Owned by the account, so combat continues when the Castle panel is closed.
    const timer = window.setInterval(() => {
      if (!document.hidden) void act({ type: 'tick' });
    }, serverBacked ? 1000 : demoStepMs);
    return () => window.clearInterval(timer);
  }, [userId, activeBattle, unavailable, serverBacked, demoStepMs, act]);
  const retryPending = () => pending.current ? act(JSON.parse(pending.current.key)) : Promise.resolve(false);
  return { state: playback.state, act, retryPending, error, unavailable, serverBacked, refresh, applyServer };
}
