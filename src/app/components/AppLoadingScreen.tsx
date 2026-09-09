import { Loader2 } from 'lucide-react';

export function AppLoadingScreen() {
    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
            <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center font-black text-xl mb-4 shadow-lg shadow-brand-500/50 animate-bounce-short">
                ?Y
            </div>
            <Loader2 className="w-6 h-6 animate-spin text-brand-400 mb-2" />
            <p className="text-sm font-medium text-slate-300">Loading Curious-Y...</p>
        </div>
    );
}
