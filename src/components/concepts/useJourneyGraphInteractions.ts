import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { Camera } from './useJourneyGraphCamera';
import type { Point } from './journeyGraphLayout';

type Gesture = Point & { distance: number; camera: Camera };
type Press = Point & { moved: boolean };
type SetCamera = (camera: Camera | ((current: Camera) => Camera)) => void;
type Zoom = (factor: number) => void;

function midpoint(points: Point[]): Point {
    return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

function distance(points: Point[]): number {
    return points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
}

function gestureCamera(points: Point[], gesture: Gesture, rect: DOMRect): Camera {
    const center = midpoint(points);
    const length = distance(points);
    const scale = Math.min(2, Math.max(0.25, gesture.camera.scale *
        (gesture.distance && length ? length / gesture.distance : 1)));
    return { scale,
        x: center.x - rect.left - (gesture.x - rect.left - gesture.camera.x) * scale / gesture.camera.scale,
        y: center.y - rect.top - (gesture.y - rect.top - gesture.camera.y) * scale / gesture.camera.scale };
}

function pan(key: string, setCamera: SetCamera) {
    setCamera(current => ({ ...current,
        x: current.x + (key === 'ArrowLeft' ? 45 : key === 'ArrowRight' ? -45 : 0),
        y: current.y + (key === 'ArrowUp' ? 45 : key === 'ArrowDown' ? -45 : 0) }));
}

function keyboard(event: KeyboardEvent<HTMLDivElement>, setCamera: SetCamera, zoom: Zoom, fit: () => void) {
    if (event.target !== event.currentTarget) {
        return;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        pan(event.key, setCamera);
    }

    if (event.key === '+' || event.key === '=') {
        zoom(1.2);
    }

    if (event.key === '-') {
        zoom(1 / 1.2);
    }

    if (event.key === '0') {
        fit();
    }
}

export function useJourneyGraphInteractions(camera: Camera, setCamera: SetCamera, zoom: Zoom, fit: () => void, onBackgroundClick: () => void) {
    const pointers = useRef(new Map<number, Point>());
    const gesture = useRef<Gesture | null>(null);
    const press = useRef<Press>({ x: 0, y: 0, moved: false });
    const rebase = () => {
        const points = [...pointers.current.values()];
        gesture.current = points.length ? { ...midpoint(points), distance: distance(points), camera } : null;
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('button')) {
            return;
        }

        press.current = { x: event.clientX, y: event.clientY, moved: pointers.current.size > 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        rebase();
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!pointers.current.has(event.pointerId) || !gesture.current) {
            return;
        }

        if (Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 5) {
            press.current.moved = true;
        }

        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        setCamera(gestureCamera([...pointers.current.values()], gesture.current,
            event.currentTarget.getBoundingClientRect()));
    };

    const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        pointers.current.delete(event.pointerId);
        rebase();
    };

    const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!(event.target as Element).closest('button') && !press.current.moved) {
            onBackgroundClick();
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => keyboard(event, setCamera, zoom, fit);
    return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClick, onKeyDown };
}
