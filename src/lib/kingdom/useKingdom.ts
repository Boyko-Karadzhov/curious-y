import { useCallback, useEffect, useState } from 'react';
import { Action, Kingdom, newKingdom } from './game';
import { changeKingdom, KINGDOM_CHANGED, loadKingdom } from './storage';

export function useKingdom(userId?: string) {
  const [state, setState] = useState<Kingdom>(newKingdom);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const refresh = useCallback(() => {
    if (!userId) return;
    try { setState(loadKingdom(userId)); setUnavailable(false); setError(null); }
    catch (e) { setUnavailable(true); setError(e instanceof Error ? e.message : 'Castle storage is unavailable.'); }
  }, [userId]);
  useEffect(() => {
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(KINGDOM_CHANGED, refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener(KINGDOM_CHANGED, refresh); };
  }, [refresh]);
  const act = useCallback(async (action: Action) => {
    if (!userId) return false;
    try {
      await changeKingdom(userId, action);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Castle action failed. Please retry.');
      return false;
    }
  }, [userId]);
  return { state, act, error, unavailable };
}
