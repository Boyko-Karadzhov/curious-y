import { useCallback, useEffect, useRef, useState } from 'react';

type LockableOrientation = ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> };

/** Fullscreen is an enhancement: the viewport overlay also works without it. */
export function useBattleExpansion() {
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const open = useRef(false);
  const session = useRef(0);
  const locked = useRef(false);
  const cancelPending = useCallback(() => {
    open.current = false;
    session.current++;
  }, []);

  const releaseOrientation = useCallback(() => {
    if (!locked.current) return;
    locked.current = false;
    try { screen.orientation?.unlock(); } catch { /* Some browsers reject unlock after fullscreen exits. */ }
  }, []);

  const collapse = useCallback(() => {
    cancelPending();
    setExpanded(false);
    releaseOrientation();
    if (document.fullscreenElement === container.current) void document.exitFullscreen().catch(() => {});
  }, [cancelPending, releaseOrientation]);

  const expand = async () => {
    const element = container.current;
    if (!element || open.current) return;
    open.current = true;
    const attempt = ++session.current;
    setExpanded(true);
    try {
      await element.requestFullscreen?.();
      if (attempt !== session.current) {
        if (!open.current && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
        return;
      }
      const orientation = screen.orientation as LockableOrientation | undefined;
      if (orientation?.lock) {
        await orientation.lock('landscape');
        locked.current = true;
        if (attempt !== session.current) releaseOrientation();
      }
    } catch { /* Keep the expanded view and let the user turn their phone. */ }
  };

  useEffect(() => {
    if (!expanded || !container.current) return;
    const element = container.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keep the live canvas mounted while making the rest of the app inaccessible.
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = element;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({ element: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    toggle.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); collapse(); }
      if (event.key !== 'Tab') return;
      const controls = [...element.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onFullscreen = () => {
      if (document.fullscreenElement !== element) collapse();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.body.style.overflow = overflow;
      siblings.forEach(sibling => { sibling.element.inert = sibling.inert; });
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [expanded, collapse]);

  useEffect(() => {
    const element = container.current;
    return () => {
      cancelPending();
      releaseOrientation();
      if (element && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, [cancelPending, releaseOrientation]);

  return { container, toggle, expanded, expand, collapse };
}
