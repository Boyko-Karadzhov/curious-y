import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BattleRenderer } from '../lib/kingdom/battleRenderer';
import { applyAction, newKingdom, unitStats, UNITS } from '../lib/kingdom/game';

describe('Battle renderer scheduling', () => {
  it('renders every unit from its own atlas, including complete cavalry and siege units', () => {
    const state = initial();
    const images=Object.fromEntries(UNITS.map(unit=>[`atlas-${unit.id}`,document.createElement('img')]));
    Object.assign(renderer,{images});
    state.battle!.fighters=UNITS.map((unit,index)=>({...unitStats(unit.id,1),id:index+1,kind:unit.id,side:'player' as const,x:10+index,maxHp:unit.hp}));
    const before=structuredClone(state.battle);
    renderer.update(state.battle!,true);frame();
    const draws=vi.mocked(context.drawImage).mock.calls;
    for(const unit of UNITS) expect(draws.some(call=>call[0]===images[`atlas-${unit.id}`])).toBe(true);
    expect(draws).toHaveLength(20); // A mounted frame must not draw an extra legacy horse.
    expect(state.battle).toEqual(before);
  });
  it('draws the generated Swordsman atlas for both teams and uses its portrait if the atlas fails', () => {
    const state = initial();
    const fighter = state.battle!.fighters[0];
    state.battle!.fighters = [{ ...fighter, x: 49 }, { ...fighter, id: 2, side: 'enemy', x: 51 }];
    const atlas = document.createElement('img'), portrait = document.createElement('img'), warrior = document.createElement('img');
    Object.assign(renderer, { images: { 'atlas-swordsman': atlas, 'unit-swordsman': portrait, 'warrior-blue': warrior, 'warrior-red': warrior } });
    renderer.update(state.battle!, true); frame();
    const draws = vi.mocked(context.drawImage).mock.calls;
    expect(draws.filter(call => call[0] === atlas)).toHaveLength(2);
    expect(draws.filter(call => call[0] === atlas).every(call => call[2] === 512 && call[3] === 256 && call[4] === 256)).toBe(true);
    expect(draws.some(call => call[0] === warrior)).toBe(false);
    expect(context.scale).toHaveBeenCalledWith(-.9375, .9375);
    Object.assign(renderer, { images: { 'unit-swordsman': portrait, 'warrior-blue': warrior } });
    vi.mocked(context.drawImage).mockClear(); frame();
    expect(vi.mocked(context.drawImage).mock.calls.every(call => call[0] === portrait)).toBe(true);
  });
  it('renders every identity and persisted ability effect without modifying combat', () => {
    const state = initial();
    state.battle!.fighters = UNITS.map((u,i) => ({ ...unitStats(u.id,1),id:i+1,kind:u.id,side:'player' as const,x:20+i*2,maxHp:u.hp,
      attackCount:5,lastAttackAt:.25,lastTargetX:65,slowUntil:2,rallyUntil:2 }));
    state.battle!.elapsed=.25;
    const before=structuredClone(state.battle);renderer.update(state.battle!,true);frame();
    for(const u of UNITS)expect(context.fillText).toHaveBeenCalledWith(u.badge,expect.any(Number),expect.any(Number));
    expect(state.battle).toEqual(before);
  });
  it('never changes selected slots, effective stats, health or battle time while rendering', () => {
    const state = initial();
    const before = structuredClone(state.battle);
    renderer.update(state.battle!, true);
    for (let i = 0; i < 120; i++) frame();
    expect(state.battle).toEqual(before);
    expect(state.battle!.fighters.map(f => f.kind)).toEqual(['swordsman']);
  });
  let now = 100;
  let nextId = 0;
  let callbacks: Map<number, FrameRequestCallback>;
  let renderer: BattleRenderer;
  let context: CanvasRenderingContext2D;
  let intersect: IntersectionObserverCallback;
  let mediaChange: () => void;
  let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
  const initial = () => {
    const state = applyAction({ ...newKingdom(), armySlots: ['swordsman', null, null, null] as ['swordsman', null, null, null], buildings: { ...newKingdom().buildings, barracks: 1, range: 0, stable: 0, workshop: 0 } }, { type: 'start', stage: 1 });
    // Rendering tests explicitly supply a fighter; new battles start empty.
    state.battle!.fighters = [{ ...unitStats('swordsman', 1), id: 1, kind: 'swordsman', side: 'player', x: 5, maxHp: 65 }];
    return state;
  };
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
    context = Object.fromEntries(['setTransform', 'clearRect', 'save', 'restore', 'translate', 'scale', 'fillRect', 'drawImage', 'rotate', 'beginPath', 'arc', 'stroke', 'fillText', 'strokeRect', 'moveTo', 'lineTo'].map(name => [name, vi.fn()])) as unknown as CanvasRenderingContext2D;
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
    frame(3100);
    expect(callbacks.size).toBe(0);
    renderer.update(applyAction(state, { type: 'tick' }).battle!, true);
    expect(callbacks.size).toBe(1);
  });

  it('keeps moving during the first server poll and a delayed response', () => {
    const state = initial();
    state.battle!.fighters = state.battle!.fighters.slice(0, 1);
    renderer.update(state.battle!, true);
    frame(600);
    expect(callbacks.size).toBe(1);
    const firstX = vi.mocked(context.translate).mock.lastCall![0];
    frame(800);
    const laterX = vi.mocked(context.translate).mock.lastCall![0];
    expect(laterX).toBeGreaterThan(firstX);
    expect(callbacks.size).toBe(1);
    const next = { ...state.battle!, elapsed: 1, fighters: [{ ...state.battle!.fighters[0], x: 12 }] };
    renderer.update(next, true);
    frame(17);
    const correctedX = vi.mocked(context.translate).mock.lastCall![0];
    expect(correctedX).toBeGreaterThan(laterX);
    expect(correctedX - laterX).toBeLessThan(1);
  });

  it('ignores duplicate simulation times for motion and the stale timeout', () => {
    const state = initial();
    renderer.update(state.battle!, true);
    frame(1500);
    const x = vi.mocked(context.translate).mock.lastCall![0];
    renderer.update(structuredClone(state.battle!), true);
    frame(17);
    expect(vi.mocked(context.translate).mock.lastCall![0]).toBeGreaterThan(x);
    frame(1600);
    expect(callbacks.size).toBe(0);
  });

  it('launches arrows and stones once per release while attacking, then clears them on completion', () => {
    const state = initial();
    const template = state.battle!.fighters[0];
    let battle = { ...state.battle!, fighters: [
      { ...template, id: 1, kind: 'archer' as const, x: 40, range: 18 },
      { ...template, id: 2, kind: 'catapult' as const, x: 30, range: 25 },
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
