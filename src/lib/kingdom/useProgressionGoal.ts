import { useCallback, useEffect, useRef, useState } from 'react';
import { Kingdom } from './game';
import { goalStorageKey, parseGoal, ProgressionGoal } from './goals';
import { getServerGoal, setServerGoal, GoalSnapshot } from '../../services/backend';
import { LearningRequestError } from '../../services/learningErrors';

// App mounts this hook afresh for each account. Only Explorer Demo uses local storage.
export function useProgressionGoal(userId: string | undefined, state: Kingdom, unavailable: boolean, isDemoUser: boolean) {
  const [goal, setGoal] = useState<ProgressionGoal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = useRef<GoalSnapshot | null>(null);
  const pending = useRef<{ goal: ProgressionGoal | null; revision: number } | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const request = useRef(0);
  const apply = useCallback((next: GoalSnapshot) => {
    if (!alive.current || (snapshot.current && next.revision < snapshot.current.revision)) return;
    snapshot.current = next;
    setGoal(next.goal); setLoaded(true); setError(null);
  }, []);
  const refresh = useCallback(async () => {
    if (!userId || isDemoUser || inFlight.current || pending.current) return;
    const current = ++request.current;
    try {
      const next = await getServerGoal();
      if (alive.current && current === request.current) apply(next);
    } catch {
      if (alive.current && current === request.current) setError('Could not load your saved goal. Please retry.');
    }
  }, [userId, isDemoUser, apply]);
  useEffect(() => {
    alive.current = true;
    if (!isDemoUser) {
      // Retire the former device preference without importing it into account state.
      try { if (userId) localStorage.removeItem(goalStorageKey(`account:${userId}`)); } catch { /* No local fallback. */ }
      void refresh();
      const onFocus = () => { void refresh(); };
      const onVisible = () => { if (!document.hidden) void refresh(); };
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        alive.current = false;
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    return () => { alive.current = false; };
  }, [userId, isDemoUser, refresh]);
  useEffect(() => {
    if (!userId || !isDemoUser || unavailable || loaded) return;
    let initial: ProgressionGoal | null = null;
    try {
      const raw = localStorage.getItem(goalStorageKey(`demo:${userId}`));
      if (raw === null) initial = state.buildings.barracks === 0 ? { type: 'building', id: 'barracks', level: 1 } : null;
      else { try { initial = parseGoal(JSON.parse(raw)); } catch { initial = null; } }
      localStorage.setItem(goalStorageKey(`demo:${userId}`), JSON.stringify(initial));
    } catch { setError('Your Demo goal could not be saved in this browser.'); }
    setGoal(initial); setLoaded(true);
  }, [userId, isDemoUser, state, unavailable, loaded]);

  const commit = async () => {
    if (!pending.current || inFlight.current) return;
    inFlight.current = true; request.current++; setSaving(true); setError(null);
    try {
      const next = await setServerGoal(pending.current.goal, pending.current.revision);
      if (!alive.current) return;
      pending.current = null; apply(next);
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof LearningRequestError && cause.httpStatus === 409) {
        pending.current = null;
        inFlight.current = false;
        await refresh();
        if (alive.current) setError('Your goal changed on another device. Review it and choose again.');
      } else setError('Could not save your goal. Retry to confirm your selection.');
    } finally {
      inFlight.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const select = async (next: ProgressionGoal | null) => {
    if (!userId || !loaded || inFlight.current) return;
    if (isDemoUser) {
      try {
        localStorage.setItem(goalStorageKey(`demo:${userId}`), JSON.stringify(next));
        setGoal(next); setError(null);
      } catch { setError('Your Demo goal could not be saved in this browser.'); }
      return;
    }
    if (pending.current) { setError('Retry the previous goal selection before choosing another.'); return; }
    pending.current = { goal: next, revision: snapshot.current!.revision };
    await commit();
  };
  const retry = () => { if (pending.current) void commit(); else void refresh(); };
  return { goal, select, error, loaded, saving, retry };
}
