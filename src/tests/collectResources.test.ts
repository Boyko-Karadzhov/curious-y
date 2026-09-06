import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectGold, collectResources } from '../components/game/collectResources';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
describe('resource collection animation', () => {
  it('animates every credited resource into its own HUD target and cleans up rejected animations', async () => {
    document.body.innerHTML = '<button id="source">Collect</button><div data-resource-topic="Physics"></div><div data-resource-topic="Life"></div><div data-resource-topic="Chemistry"></div>';
    const calls: HTMLElement[] = [];
    vi.stubGlobal('Animation', class {});
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function () { calls.push(this); return { finished: Promise.reject(new Error('cancelled')) } as unknown as Animation; };
    try {
      await collectResources(document.getElementById('source')!, [{ key: 'force', amount: 7 }, { key: 'essence', amount: 3 }]);
      expect(calls.filter(el => el.dataset.resourceTopic).map(el => el.dataset.resourceTopic)).toEqual(['Physics', 'Life']);
      expect(document.querySelectorAll('.collect-resource-particle')).toHaveLength(0);
    } finally { HTMLElement.prototype.animate = original; }
  });
  it('skips animation for reduced motion', async () => {
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...original(query), matches: true }));
    const source = document.createElement('button'); source.animate = vi.fn();
    document.body.innerHTML = '<div data-resource-topic="Physics"></div><div data-resource-gold></div>';
    await collectResources(source, [{ key: 'force', amount: 10 }]);
    await collectGold(source);
    expect(source.animate).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.collect-resource-particle')).toHaveLength(0);
  });
});
