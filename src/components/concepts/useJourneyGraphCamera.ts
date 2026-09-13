import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from './journeyGraphLayout';

export type Camera = Point & { scale: number };

export function useJourneyGraphCamera(width: number, height: number, selected: Point, journeyId: string) {
    const viewport = useRef<HTMLDivElement>(null);
    const [camera, setCamera] = useState<Camera>({ x: 20, y: 20, scale: 1 });
    const fit = useCallback(() => {
        if (!viewport.current) {
            return;
        }

        const { clientWidth: w, clientHeight: h } = viewport.current;
        const scale = Math.min((w - 32) / width, (h - 72) / height, 1.15);
        setCamera({ x: (w - width * scale) / 2, y: (h - height * scale) / 2 - 12, scale });
    }, [width, height]);
    const zoom = useCallback((factor: number, x?: number, y?: number) => {
        setCamera(current => {
            const scale = Math.min(2, Math.max(0.25, current.scale * factor));
            const cx = x ?? (viewport.current?.clientWidth ?? 600) / 2;
            const cy = y ?? 230;
            return { scale, x: cx - (cx - current.x) * scale / current.scale,
                y: cy - (cy - current.y) * scale / current.scale };
        });
    }, []);
    useEffect(() => {
        setCamera({ x: 30 - selected.x * 0.8, y: 75 - selected.y * 0.8, scale: 0.8 });
    }, [selected.x, selected.y, journeyId]);
    useEffect(() => {
        const element = viewport.current;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = element!.getBoundingClientRect();
            zoom(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
        };

        element?.addEventListener('wheel', wheel, { passive: false });
        return () => element?.removeEventListener('wheel', wheel);
    }, [zoom]);
    return { viewport, camera, setCamera, fit, zoom };
}
