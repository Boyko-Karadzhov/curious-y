import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKingdom } from '../lib/kingdom/useKingdom';
import { newKingdom, type KingdomSnapshot } from '../lib/kingdom/game';
import { commandServerKingdom, getServerKingdom } from '../services/backend';
import { executeKingdomCommand } from '../../supabase/functions/learning/kingdom';

vi.mock('../services/backend', () => ({ getServerKingdom: vi.fn(), commandServerKingdom: vi.fn() }));

describe('Server battle playback lifecycle', () => {
    let snapshot: KingdomSnapshot;
    beforeEach(() => {
        vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
        const state = newKingdom(); state.buildings.barracks = 1;
        state.units.militia = { unitId: 'militia', investedXP: 0, locked: false };
        state.armySlots = ['militia', null, null, null, null];
        snapshot = { state, generation: 0, revision: 0 };
        vi.mocked(getServerKingdom).mockImplementation(async () => structuredClone(snapshot));
        vi.mocked(commandServerKingdom).mockImplementation(async (command, generation, requestId) => {
            const next = executeKingdomCommand({ ...snapshot, battle_clock: null, server_now: '2026-09-07T00:00:00Z' }, command,
                { requestId, draws: [.125] });
            snapshot = { state: next.state, generation, revision: snapshot.revision + 1 };
            return structuredClone(snapshot);
        });
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
    const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    it('sends only Start, simulates offline, survives refresh and reveals the saved result at the end', async () => {
        const hook = renderHook(() => useKingdom('player'));
        await advance(0);
        await act(async () => { expect(await hook.result.current.act({ type: 'start', stage: 1 })).toBe(true); });
        expect(snapshot.state.battle!.result).toBe('victory');
        expect(hook.result.current.state.battle!.result).toBeNull();
        expect(hook.result.current.state.cleared).toBe(0);
        await advance(3000);
        const elapsed = hook.result.current.state.battle!.elapsed;
        expect(elapsed).toBeGreaterThan(10);
        await act(async () => hook.result.current.refresh());
        expect(hook.result.current.state.battle!.elapsed).toBe(elapsed);
        vi.mocked(getServerKingdom).mockRejectedValue(new Error('Offline'));
        await act(async () => hook.result.current.refresh());
        await advance(2000);
        expect(hook.result.current.state.battle!.elapsed).toBeGreaterThan(elapsed);
        expect(commandServerKingdom).toHaveBeenCalledTimes(1);
        await advance(90000);
        expect(hook.result.current.state).toEqual(snapshot.state);
        expect(commandServerKingdom).toHaveBeenCalledTimes(1);
        expect(snapshot.state.gold).toBe(0);
    });

    it('resumes viewing position on reload, skips locally, and never replays a finished identity', async () => {
        let hook = renderHook(() => useKingdom('player'));
        await advance(0);
        await act(async () => { await hook.result.current.act({ type: 'start', stage: 1 }); });
        await advance(3000);
        const elapsed = hook.result.current.state.battle!.elapsed;
        hook.unmount();
        hook = renderHook(() => useKingdom('player'));
        await advance(0);
        expect(hook.result.current.state.battle!.elapsed).toBe(elapsed);
        await act(async () => { expect(await hook.result.current.act({ type: 'retreat' })).toBe(true); });
        expect(hook.result.current.state).toEqual(snapshot.state);
        expect(commandServerKingdom).toHaveBeenCalledTimes(1);
        hook.unmount();
        hook = renderHook(() => useKingdom('player'));
        await advance(0);
        expect(hook.result.current.state).toEqual(snapshot.state);
    });

    it('recovers a lost Start response using the same request identity without polling', async () => {
        const serverCommand = vi.mocked(commandServerKingdom).getMockImplementation()!;
        vi.mocked(commandServerKingdom).mockImplementationOnce(async (...args) => {
            await serverCommand(...args); throw new Error('Response lost');
        });
        const hook = renderHook(() => useKingdom('player'));
        await advance(0);
        await act(async () => { expect(await hook.result.current.act({ type: 'start', stage: 1 })).toBe(false); });
        expect(snapshot.state.battle!.result).toBe('victory');
        vi.mocked(commandServerKingdom).mockResolvedValueOnce(structuredClone(snapshot));
        await act(async () => { expect(await hook.result.current.retryPending()).toBe(true); });
        expect(vi.mocked(commandServerKingdom).mock.calls[0]).toEqual(vi.mocked(commandServerKingdom).mock.calls[1]);
        expect(hook.result.current.state.battle!.elapsed).toBe(0);
        await advance(1000);
        expect(commandServerKingdom).toHaveBeenCalledTimes(2);
    });

    it('pauses hidden playback and clears it on a reset or account change', async () => {
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        const hook = renderHook(({ userId }) => useKingdom(userId), { initialProps: { userId: 'player' } });
        await advance(0);
        await act(async () => { await hook.result.current.act({ type: 'start', stage: 1 }); });
        await advance(1000);
        const elapsed = hook.result.current.state.battle!.elapsed;
        act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
        await advance(60000);
        expect(hook.result.current.state.battle!.elapsed).toBe(elapsed);
        act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
        await advance(1000);
        expect(hook.result.current.state.battle!.elapsed).toBeGreaterThan(elapsed);
        snapshot = { state: newKingdom(), generation: 1, revision: 10 };
        await act(async () => hook.result.current.applyServer(snapshot));
        await advance(1000);
        expect(hook.result.current.state.battle).toBeNull();
        hook.rerender({ userId: 'another-player' });
        await advance(0);
        expect(hook.result.current.state.battle).toBeNull();
    });
});
