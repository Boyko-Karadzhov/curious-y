import { describe, expect, it } from 'vitest';
import { applyAction, Battle, Fighter, nearestOpponent, newKingdom } from '../lib/kingdom/game';
import { interpolateX, projectilePosition, spriteFrame, visualUnits } from '../lib/kingdom/battleAnimation';

const soldier = (id: number, x: number, side: Fighter['side'] = 'player'): Fighter => ({
  id, x, side, kind: 'barracks', hp: 65, maxHp: 65, damage: 12, range: 3, speed: 7,
});
function battle(fighters: Fighter[]): Battle {
  return { ...applyAction({ ...newKingdom(), buildings: { barracks: 1, range: 0, stable: 0, workshop: 0 } },
    { type: 'start', stage: 1 }).battle!, fighters };
}

describe('Battle animation follows combat snapshots', () => {
  it('walks until in range, selects enemies before castles, and idles after battle', () => {
    const archer = { ...soldier(1, 80), kind: 'range' as const, range: 18 };
    expect(visualUnits(battle([archer, soldier(2, 99, 'enemy')]), [], 1)[0].pose).toBe('walk');
    archer.x = 83;
    expect(visualUnits(battle([archer, soldier(2, 99, 'enemy')]), [], 1)[0]).toMatchObject({ pose: 'attack', targetId: 2, targetX: 99 });
    expect(visualUnits(battle([archer]), [], 1)[0]).toMatchObject({ pose: 'attack', targetX: 100 });
    expect(visualUnits({ ...battle([archer]), result: 'victory' }, [], 1)[0].pose).toBe('idle');
    expect(visualUnits(battle([{ ...archer, side: 'enemy', x: 15 }]), [], 1)[0]).toMatchObject({ pose: 'attack', targetX: 0 });
  });

  it('interpolates from the displayed position without overshoot or mutating snapshots', () => {
    const initial = battle([soldier(1, 10)]);
    const first = visualUnits(initial, [], 1);
    const next = visualUnits(battle([soldier(1, 20)]), first, 1);
    expect(interpolateX(next[0], 0.5)).toBe(15);
    const interrupted = visualUnits(battle([soldier(1, 30)]), next, 0.5);
    expect(interrupted[0].from).toBe(15);
    expect(interpolateX(interrupted[0], 100)).toBe(30);
    expect(interpolateX(interrupted[0], -1)).toBe(15);
    expect(initial.fighters[0].x).toBe(10);
    expect(visualUnits(battle([soldier(2, 5)]), interrupted, 1)[0].from).toBe(5);
  });

  it('uses valid populated sprite frames and horizontal sword/bow attack rows', () => {
    expect(spriteFrame('barracks', 'attack', 0.45)).toEqual({ row: 2, column: 3 });
    expect(spriteFrame('range', 'attack', 0.91)).toEqual({ row: 4, column: 6 });
    for (let time = 0; time < 10; time += 0.017) {
      expect(spriteFrame('range', 'walk', time).column).toBeLessThan(6);
      expect(spriteFrame('range', 'idle', time).column).toBeLessThan(6);
    }
    expect(spriteFrame('range', 'attack', 0.91, true)).toEqual({ row: 0, column: 0 });
  });

  it('sends projectiles along arcs in both directions and lands exactly at the target', () => {
    for (const end of [100, -100]) {
      expect(projectilePosition(0, 100, end, 120, 0, 60)).toMatchObject({ x: 0, y: 100 });
      expect(projectilePosition(0, 100, end, 120, 0.5, 60)).toMatchObject({ x: end / 2, y: 50 });
      expect(projectilePosition(0, 100, end, 120, 1, 60)).toMatchObject({ x: end, y: 120 });
    }
  });

  it('preserves original targeting, including equal-distance ties, without sorting', () => {
    for (let sample = 0; sample < 100; sample++) {
      const fighters = Array.from({ length: 48 }, (_, id) => soldier(id, (id * 37 + sample * 13) % 101, id % 2 ? 'enemy' : 'player'));
      const before = structuredClone(fighters);
      for (const fighter of fighters) {
        const original = fighters.filter(f => f.side !== fighter.side).sort((a, b) => Math.abs(a.x - fighter.x) - Math.abs(b.x - fighter.x))[0];
        expect(nearestOpponent(fighter, fighters)).toBe(original);
      }
      expect(fighters).toEqual(before);
    }
    const center = soldier(1, 50);
    expect(nearestOpponent(center, [center, soldier(2, 48, 'enemy'), soldier(3, 52, 'enemy')])?.id).toBe(2);
  });
});
