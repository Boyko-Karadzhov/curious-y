import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BattleRenderer } from '../lib/kingdom/battleRenderer';
import { applyAction, newKingdom } from '../lib/kingdom/game';

describe('Battle renderer scheduling', () => {
  let now = 100;
  let nextId = 0;
  let callbacks: Map<number, FrameRequestCallback>;
  let renderer: BattleRenderer;
  let context: CanvasRenderingContext2D;
  let intersect: IntersectionObserverCallback;
  let mediaChange: () => void;
  let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  const initial = () => applyAction({ ...newKingdom(), buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
  function frame(ms = 17) {
    now += ms;
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(now));
  }
  beforeEach(() => {
    now = 100; nextId = 0; callbacks = new Map();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {} disconnect() {}
    });
    media = { matches: false, addEventListener: vi.fn((_event, callback) => { mediaChange = callback; }), removeEventListener: vi.fn() };
    vi.mocked(window.matchMedia).mockReturnValue(media as unknown as MediaQueryList);
    context = Object.fromEntries(['setTransform', 'clearRect', 'save', 'restore', 'translate', 'scale', 'fillRect', 'drawImage', 'rotate', 'beginPath', 'arc', 'stroke'].map(name => [name, vi.fn()])) as unknown as CanvasRenderingContext2D;
    renderer = new BattleRenderer(document.createElement('canvas'), context);
  });
  afterEach(() => { renderer.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps one loop across updates and stops on completion and disposal', () => {
    let state = initial();
    renderer.update(state.battle!, true);
    expect(callbacks.size).toBe(1);
    frame();
    state = applyAction(state, { type: 'tick' });
    renderer.update(state.battle!, true);
    renderer.update(state.battle!, true);
    expect(callbacks.size).toBe(1);
    renderer.update({ ...state.battle!, result: 'victory' }, false);
    expect(callbacks.size).toBe(0);
    renderer.update(initial().battle!, true);
    expect(callbacks.size).toBe(1);
    renderer.dispose();
    expect(callbacks.size).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('suspends all frame work offscreen or hidden and resumes a single loop', () => {
    renderer.update(initial().battle!, true);
    intersect([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(callbacks.size).toBe(0);
    const draws = vi.mocked(context.clearRect).mock.calls.length;
    frame();
    expect(context.clearRect).toHaveBeenCalledTimes(draws);
    intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(callbacks.size).toBe(1);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
  });

  it('renders reduced motion snapshots without a continuous loop', () => {
    renderer.update(initial().battle!, true);
    media.matches = true; mediaChange();
    expect(callbacks.size).toBe(0);
    expect(context.fillRect).toHaveBeenCalled();
    media.matches = false; mediaChange();
    expect(callbacks.size).toBe(1);
  });

  it('stops on stale snapshots and restarts when fresh battle data arrives', () => {
    const state = initial();
    renderer.update(state.battle!, true);
    frame(600);
    expect(callbacks.size).toBe(0);
    renderer.update(applyAction(state, { type: 'tick' }).battle!, true);
    expect(callbacks.size).toBe(1);
  });

  it('launches arrows and stones once per release while attacking, then clears them on completion', () => {
    const state = initial();
    const template = state.battle!.fighters[0];
    let battle = { ...state.battle!, fighters: [
      { ...template, id: 1, kind: 'range' as const, x: 40, range: 18 },
      { ...template, id: 2, kind: 'workshop' as const, x: 30, range: 25 },
      { ...template, id: 3, side: 'enemy' as const, x: 54 },
    ] };
    const arrow = document.createElement('img');
    const stone = document.createElement('img');
    // Inject decoded artwork at the rendering boundary; assert actual canvas
    // draws instead of relying on timers or projectile state alone.
    Object.assign(renderer, { images: { arrow, stone } });
    renderer.update(battle, true);
    for (let i = 0; i < 90; i++) {
      if (i % 15 === 0) { battle = { ...battle, elapsed: battle.elapsed + 0.25 }; renderer.update(battle, true); }
      frame();
    }
    const draws = vi.mocked(context.drawImage).mock.calls;
    expect(draws.some(call => call[0] === arrow)).toBe(true);
    expect(draws.some(call => call[0] === stone)).toBe(true);
    vi.mocked(context.drawImage).mockClear();
    renderer.update({ ...battle, result: 'victory' }, false);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
  });
});
