import { useCallback, useEffect, useState } from 'react';
import { Kingdom } from './game';
import { BattlePlayback } from './battlePlayback';

export function useBattlePlayback(state: Kingdom, userId?: string) {
    const battle = state.battle;
    const key = userId && battle?.id && battle.result ? `${userId}:${battle.id}` : null;
    const storageKey = `curious_y_battle_playback_${userId}`;
    const [playback, setPlayback] = useState<{ key: string | null; controller: BattlePlayback | null }>({ key: null, controller: null });
    const [, redraw] = useState(0);
    // Identity, not snapshot reference: wallet refreshes cannot rewind a replay.
    if (playback.key !== key) {
        let elapsed = 0;
        let done = battle?.rewardCollected ?? false;
        try {
            const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
            if (saved?.id === battle?.id) {
                if (Number.isFinite(saved.elapsed)) {
                    elapsed = saved.elapsed;
                }
                done ||= saved.done === true;
            }
        } catch { /* Playback storage is optional and never owns progress. */ }
        const controller = key && battle ? new BattlePlayback(battle, elapsed) : null;
        if (done) {
            controller?.finish();
        }
        setPlayback({ key, controller });
    }
    const controller = playback.key === key ? playback.controller : null;
    useEffect(() => {
        if (!controller) {
            return;
        }
        let frame = 0;
        let last: number | undefined;
        let savedAt = 0;
        const save = () => {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify({ id: controller.outcome.id, elapsed: controller.battle.elapsed, done: !!controller.battle.result })); 
            } catch { /* Losing a viewing position cannot lose the settled battle. */ }
        };
        const render = (now: number) => {
            if (document.hidden) {
                last = undefined; return; 
            }
            if (last !== undefined && controller.advance(now - last)) {
                redraw(value => value + 1);
            }
            last = now;
            if (controller.battle.result || now - savedAt >= 1000) {
                save(); savedAt = now; 
            }
            if (!controller.battle.result) {
                frame = requestAnimationFrame(render);
            }
        };
        const visibility = () => {
            cancelAnimationFrame(frame);
            last = undefined;
            save();
            if (!document.hidden && !controller.battle.result) {
                frame = requestAnimationFrame(render);
            }
        };
        document.addEventListener('visibilitychange', visibility);
        if (!controller.battle.result) {
            frame = requestAnimationFrame(render);
        }
        return () => {
            cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); save(); 
        };
    }, [controller, storageKey]);
    const skip = useCallback(() => {
        if (!controller || controller.battle.result) {
            return false;
        }
        controller.finish();
        redraw(value => value + 1);
        return true;
    }, [controller]);
    const active = controller && !controller.battle.result;
    return { state: active ? { ...state, battle: controller.battle, cleared: Math.min(state.cleared, controller.battle.stage - 1) } : state, skip };
}
