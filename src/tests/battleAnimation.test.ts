import { describe, expect, it } from 'vitest';
import { applyAction, Battle, Fighter, nearestOpponent, newKingdom } from '../lib/kingdom/game';
import { motionX, predictionTime, projectilePosition, spriteFrame, visualUnits } from '../lib/kingdom/battleAnimation';

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

  it('predicts movement immediately and reconciles from the displayed position without mutating snapshots', () => {
    const initial = battle([soldier(1, 10)]);
    const first = visualUnits(initial, [], 1);
    expect(motionX(first[0], 0.5)).toBe(13.5);
    const next = visualUnits(battle([soldier(1, 17)]), first, 1.2);
    expect(motionX(next[0], 0)).toBe(18.4);
    expect(motionX(next[0], 0.1)).toBeCloseTo(18.75);
    const interrupted = visualUnits(battle([soldier(1, 20)]), next, 0.5);
    expect(motionX(interrupted[0], 0)).toBe(motionX(next[0], 0.5));
    expect(motionX(interrupted[0], -1)).toBe(interrupted[0].from);
    expect(initial.fighters[0].x).toBe(10);
    expect(visualUnits(battle([soldier(2, 5)]), interrupted, 1)[0].from).toBe(5);
  });

  it('keeps marching through jittery and skipped server polls without jumps, pauses, or speed bursts', () => {
    let units = visualUnits(battle([soldier(1, 10)]), [], 0);
    let received = 0;
    let previousX = 10;
    // Quantized server time, uneven response latency, and a skipped one-second poll.
    const packets = [[1.17, 1], [2.03, 1.75], [3.84, 3.5], [4.69, 4.5], [5.95, 5.75]];
    for (let frame = 1; frame <= 390; frame++) {
      const now = frame / 60;
      if (packets.length && now >= packets[0][0]) {
        const [, elapsed] = packets.shift()!;
        const displayed = motionX(units[0], now - received);
        units = visualUnits(battle([soldier(1, 10 + elapsed * 7)]), units, now - received);
        received = now;
        expect(motionX(units[0], 0)).toBeCloseTo(displayed);
      }
      const x = motionX(units[0], now - received);
      expect(x - previousX).toBeGreaterThanOrEqual(7 / 120 - 0.00001);
      expect(x - previousX).toBeLessThanOrEqual(7 / 40 + 0.00001);
      previousX = x;
    }
  });

  it('bounds prediction at castles and approaching enemies, then coasts to a stop during an outage', () => {
    const advancing = visualUnits(battle([soldier(1, 40), soldier(2, 60, 'enemy')]), [], 0);
    for (let age = 0; age < 6; age += 0.05) {
      expect(motionX(advancing[1], age) - motionX(advancing[0], age)).toBeGreaterThanOrEqual(3);
    }
    const castle = visualUnits(battle([soldier(1, 95)]), [], 0)[0];
    expect(motionX(castle, 2)).toBe(97);
    expect(predictionTime(1.5)).toBe(1.5);
    expect(predictionTime(2.9) - predictionTime(2.8)).toBeLessThan(0.02);
    expect(predictionTime(3)).toBe(predictionTime(60));
    const attacking = visualUnits(battle([soldier(1, 49), soldier(2, 51, 'enemy')]), [], 0)[0];
    expect(motionX(attacking, 2)).toBe(49);
  });

  it('keeps separation while reconciling a predicted unit toward an older server position', () => {
    const old = visualUnits(battle([soldier(1, 78)]), [], 0);
    const corrected = visualUnits(battle([soldier(1, 80), soldier(2, 90, 'enemy')]), old, 1);
    expect(corrected[0].from).toBe(85);
    for (let age = 0; age <= 3; age += 0.01) {
      expect(motionX(corrected[1], age) - motionX(corrected[0], age)).toBeGreaterThanOrEqual(3);
    }
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
