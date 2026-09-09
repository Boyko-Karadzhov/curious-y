import { seedRoster } from './fixtures/roster';
import { describe, expect, it } from 'vitest';
import { advanceBattle, applyAction, battleSeconds, battleSpeed, createBattle, newKingdom, parseKingdom, reconcileUnits, replayBattle, UNITS, unitStats, xpThreshold, type UnitId, type ArmySlots, type Kingdom } from '../lib/kingdom/game';
import { executeKingdomCommand } from '../../supabase/functions/learning/kingdom';
import { motionX, visualUnits } from '../lib/kingdom/battleAnimation';
import legacy from './fixtures/rules5-battle-balance.json';
import earlyBalance from '../../docs/early-battle-balance.json';

function army(keep: number, tier: number, slots: ArmySlots): Kingdom {
    const s = newKingdom(); s.castle = keep;
    for (const id of slots) {
        if (id) {
            s.buildings[UNITS.find(u => u.id === id)!.building] = tier;
        }
    }

    s.armySlots = slots;
    return seedRoster(reconcileUnits(s));
}

function fight(state: Kingdom, stage: number) {
    let s = applyAction({ ...state, cleared: stage - 1 }, { type: 'start', stage });
    while (!s.battle!.result) {
        s = applyAction(s, { type: 'tick' });
    }

    return s.battle!;
}

describe('Battle balance and learning progression', () => {
    it('doubles first and recurring player spawns for every tier and class, preserving enemy cadence', () => {
        const state = army(3, 1, ['militia', 'slinger', 'hatchling', 'medic', 'ballista']);
        for (const unit of UNITS) {
            const previous = unitStats(unit.id, 1, 13);
            expect(unitStats(unit.id, 1)).toEqual({ ...previous, spawnInterval: previous.spawnInterval * 2 });
        }

        let started = applyAction(state, { type: 'start', stage: 1 });
        expect(started.battle!.nextSpawn).toEqual({0:18,1:24,2:36,3:48,4:48});
        expect(started.battle!.nextEnemy).toBe(18);
        expect(started.battle!.config.enemy.spawnInterval).toBe(33);
        for (let i = 0; i < 71; i++) {
            started = applyAction(started, { type: 'tick' });
        }

        expect(started.battle!.playerSpawned).toBe(0);
        started = applyAction(started, { type: 'tick' });
        expect(started.battle!.playerSpawned).toBe(1);
        expect(started.battle!.nextSpawn[0]).toBe(36);
        expect(started.battle!.spawned).toBe(1);
        expect(started.battle!.nextEnemy).toBe(51);
        expect(parseKingdom(JSON.stringify(started))).toEqual(started);
        const recurring = advanceBattle(started.battle!, 72);
        expect(recurring.nextSpawn).toEqual({0:54,1:48,2:72,3:48,4:48});
        expect(recurring.playerSpawned).toBe(4);
        for (const stage of [2, 10, 11, 50]) {
            const battle = createBattle(state, stage);
            expect(battle.config.enemy.firstSpawn).toBe(6);
            expect(battle.config.enemy.spawnInterval).toBe(Math.max(2.5, 6 - (stage - 1) % 10 * .25) * 2);
        }
    });

    it('triples enemy health, damage and healing after the tutorial without changing their deployment stats', () => {
        const state = army(1, 1, ['militia', null, null, null, null]);
        for (const stage of [1, 2, 7, 11, 20, 31, 50]) {
            for (const enemy of createBattle(state, stage).config.enemy.units) {
                const before = unitStats(enemy.id, 1, 13), power = stage === 1 ? 1 : 3;
                expect(enemy).toEqual({ ...before, hp: before.hp * power, damage: before.damage * power,
                    healPerSecond: before.healPerSecond! * power, healBudget: before.healBudget! * power });
            }
        }
    });

    it('wins 1-1 with a single Militia; the full starter pack loses 1-2', () => {
        const starter = army(1, 1, ['militia', null, null, null, null]);
        expect(fight(starter, 1).result).toBe('victory');
        expect(fight(starter, 2).result).not.toBe('victory');
        const reinforced = army(1, 1, ['militia', 'slinger', 'hatchling', null, null]);
        expect(fight(reinforced, 1).result).toBe('victory');
        expect(fight(reinforced, 2).result).toBe('defeat');
    });

    it('stops most legal two-pack armies at 1-2 and makes training a useful way forward', () => {
        let initialWins = 0, trainedWins = 0;
        for (const { units } of earlyBalance.progression) {
            const state = newKingdom(); state.buildings.barracks = 1;
            units.forEach((id, i) => {
                state.units[`copy-${i}`] = { unitId: id as UnitId, investedXP: 0, locked: false }; state.armySlots[i] = `copy-${i}`; 
            });
            const result = advanceBattle(createBattle(state, 2), 1800).result;
            if (result === 'victory') {
                initialWins++;
            }

            // No unupgraded formation may reproduce the old march into chapter 2.
            expect(advanceBattle(createBattle(state, 5), 1800).result).not.toBe('victory');
            for (const recruit of Object.values(state.units)) {
                recruit.investedXP = xpThreshold(2, recruit.unitId);
            }

            if (advanceBattle(createBattle(state, 2), 1800).result === 'victory') {
                trainedWins++;
            }
        }

        expect(earlyBalance.progression).toHaveLength(75);
        expect(initialWins).toBeGreaterThan(0);
        expect(initialWins).toBeLessThanOrEqual(10);
        expect(trainedWins).toBeGreaterThanOrEqual(20);
        expect(trainedWins).toBeGreaterThan(initialWins);
    });

    it('resumes rules-13 battles with their frozen timing and opponent strength', () => {
        const state = army(1, 1, ['militia', null, null, null, null]);
        const old = createBattle(state, 2); old.config.rulesVersion = 13;
        old.config.slots = [unitStats('militia', 1, 13), null, null, null, null];
        old.config.enemy.units = old.config.enemy.units.map(u => unitStats(u.id, 1, 13));
        old.nextSpawn = { 0: 9 };
        state.battle = advanceBattle(old, 40);
        const saved = parseKingdom(JSON.stringify(state)).battle!;
        expect(saved.playerSpawned).toBe(1);
        expect(saved.config.enemy.units[0].hp).toBe(65);
        expect(advanceBattle(saved, 32)).toEqual(advanceBattle(replayBattle(saved), 72));
        expect(createBattle(state, 2).config.enemy.units[0].hp).toBe(195);
    });

    it('requires the next roster tier at chapter transitions and rewards further training', () => {
        for(let tier=2;tier<=5;tier++) {
            const stage=(tier-1)*10+1;
            const ids=(t: number) => [...['melee','ranged','swarm','siege'].map(c=>UNITS.find(u=>u.unitClass===c&&u.tier===t)!.id), null] as ArmySlots;
            const prior=army(Math.max(3,tier),tier,ids(tier-1));
            for(const id of prior.armySlots) {
                if(id) {
                    prior.units[id].investedXP=0;
                }
            }

            const priorBattle = fight(prior,stage);
            expect(priorBattle.result).toBe('defeat');
            const upgraded=army(Math.max(3,tier),tier,ids(tier));
            for(const id of upgraded.armySlots) {
                if(id) {
                    upgraded.units[id].investedXP=20*3**(UNITS.find(u=>u.id===id)!.tier-1);
                }
            }

            const upgradedBattle = fight(upgraded,stage);
            expect(upgradedBattle.result).toBe('victory');
            const trained = structuredClone(upgraded);
            for (const recruit of Object.values(trained.units)) {
                recruit.investedXP = xpThreshold(3, recruit.unitId);
            }

            expect(fight(trained, stage).elapsed).toBeLessThan(upgradedBattle.elapsed);
            const next=createBattle(upgraded,stage);
            expect(next.config.enemy.units[0].id).toBe(ids(tier)[0]);
            expect(next.config.enemy.units[0].hp).toBeGreaterThan(unitStats(ids(tier-1)[0] as never,1).hp*2);
            expect(next.enemyMaxHp).toBeGreaterThan(createBattle(prior,stage-1).enemyMaxHp);
        }
    });

    it('runs at fivefold wall speed, with matching visual movement and drift-free polling', () => {
        const state = applyAction(army(1, 1, ['militia', null, null, null, null]), { type: 'start', stage: 1 });
        const base = { state, revision: 0, generation: 0, battle_clock: '2026-09-06T00:00:00Z', server_now: '2026-09-06T00:00:00Z' };
        let split = base;
        for (const ms of [63, 127, 189, 251, 999, 1013, 2031, 4999, 10000]) {
            const now = new Date(Date.parse(base.server_now) + ms).toISOString();
            const next = executeKingdomCommand({ ...split, server_now: now }, { type: 'tick' });
            split = { ...split, state: next.state, battle_clock: next.battleClock!, server_now: now };
        }

        expect(split.state).toEqual(executeKingdomCommand({ ...base, server_now: split.server_now }, { type: 'tick' }).state);
        expect(split.state.battle!.elapsed).toBe(50);
        expect(battleSpeed(6)).toBe(5); expect(battleSpeed(5)).toBe(1);
        const spec = state.battle!.config.slots[0]!;
        expect(battleSeconds(state.battle!, (95 - spec.range) / spec.speed)).toBeLessThan(10);
        const spawned = applyAction(state, { type: 'tick' });
    spawned.battle!.fighters = [{ ...spec, kind: spec.id, id: 1, x: 5, side: 'player', maxHp: spec.hp }];
    const visual = visualUnits(spawned.battle!, [], 0)[0];
    expect(motionX(visual, .5) - 5).toBeCloseTo(spec.speed * 5 * .5);
    });

    it('resets pre-recruitment saves consistently', () => {
        for (const {saved} of legacy) {
            const s=parseKingdom(JSON.stringify(saved));expect(s.battle).toBeNull();expect(s.units).toEqual({});expect(s.tokens).toEqual(saved.tokens);
        }
    });
});
