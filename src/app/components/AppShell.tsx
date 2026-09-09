import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
    return (
        <div className="kingdom-app min-h-screen flex flex-col text-slate-900 selection:bg-amber-300 selection:text-slate-950">
            {children}
        </div>
    );
}
