import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, Kingdom, KingdomSnapshot, newKingdom } from './game';
import { changeKingdom, KINGDOM_CHANGED, loadKingdom } from './storage';
import { commandServerKingdom, getServerKingdom } from '../../services/backend';
import { LearningRequestError } from '../../services/learningErrors';

export function useKingdom(userId?: string, isDemoUser = false) {
  const serverBacked = !!userId && !isDemoUser;
  const [state, setState] = useState<Kingdom>(newKingdom);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(serverBacked);
  const snapshot = useRef<KingdomSnapshot | null>(null);
  const identity = useRef(userId);
  identity.current = userId;
  const pending = useRef<{ key: string; id: string; generation: number } | null>(null);
  const inFlight = useRef(false);
  const applyServer = useCallback((next: KingdomSnapshot) => {
    if (identity.current !== userId) return;
    if (snapshot.current && next.revision < snapshot.current.revision) return;
    snapshot.current = next;
    setState(next.state); setUnavailable(false); setError(null);
  }, [userId]);
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      if (serverBacked) {
        const next = await getServerKingdom();
        if (identity.current !== userId) return;
        applyServer(next);
        if (pending.current && pending.current.generation !== next.generation) pending.current = null;
      } else { setState(loadKingdom(userId)); setUnavailable(false); setError(null); }
    } catch (e) {
      if (identity.current !== userId) return;
      setUnavailable(true); setError(e instanceof Error ? e.message : 'Castle is unavailable.');
    }
  }, [userId, serverBacked, applyServer]);
  useEffect(() => {
    snapshot.current = null; pending.current = null;
    setState(newKingdom()); setUnavailable(serverBacked);
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
  }, [refresh, serverBacked]);
  const act = useCallback(async (action: Action) => {
    if (!userId || inFlight.current) return false;
    inFlight.current = true;
    try {
      if (!serverBacked) await changeKingdom(userId, action);
      else {
        if (action.type === 'answer') throw new Error('Learning rewards can only be issued by the answer service.');
        if (!snapshot.current) throw new Error('Reload your Castle before making changes.');
        const key = JSON.stringify(action);
        if (pending.current && pending.current.key !== key) throw new Error('Retry the previous Castle action before making another change.');
        pending.current ??= { key, id: crypto.randomUUID(), generation: snapshot.current.generation };
        const next = await commandServerKingdom(action, pending.current.generation, pending.current.id);
        pending.current = null;
        if (identity.current !== userId) return false;
        applyServer(next);
      }
      setError(null);
      return true;
    } catch (e) {
      if (e instanceof LearningRequestError && e.httpStatus && e.httpStatus >= 400 && e.httpStatus < 500) pending.current = null;
      setError(e instanceof Error ? e.message : 'Castle action failed. Please retry.');
      return false;
    } finally { inFlight.current = false; }
  }, [userId, serverBacked, applyServer]);
  return { state, act, error, unavailable, serverBacked, refresh, applyServer };
}
