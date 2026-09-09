import { ReactNode, useEffect, useId, useRef, useState } from 'react';

export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const [pinned, setPinned] = useState(false);
    const open = hovered || pinned;
    useEffect(() => {
        if (!open) {
            return;
        }
        const dismiss = () => {
            setHovered(false); setPinned(false); 
        };
        const onPointerDown = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                dismiss();
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                dismiss();
            } 
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);
    return <div ref={root} className="relative shrink-0" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                setHovered(false); setPinned(false); 
            } 
        }}>
        <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined}
            onFocus={() => setHovered(true)} onClick={() => {
                setPinned(!pinned); setHovered(false); 
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-sm font-bold">?</span>
        </button>
        {open && <div id={id} role="tooltip" className="absolute right-0 top-full z-30 w-56 max-w-[calc(100vw-4rem)] rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600 shadow-xl space-y-2">{children}</div>}
    </div>;
}
