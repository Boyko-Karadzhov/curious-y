export function AppFooter({ isDemoUser }: { isDemoUser: boolean }) {
    return (
        <footer className="bg-[#091724] border-t border-white/10 py-6 text-center text-xs text-slate-400">
            <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                    <span className="font-bold text-slate-200">Curious-Y Kingdoms</span>
                    <span>&bull;</span>
                    <span>Knowledge builds the kingdom</span>
                </div>
                <div className="text-slate-400">
                    {isDemoUser ? 'Explorer demo · Sample learning' : 'Server-verified learning · Powered by Gemini'}
                </div>
            </div>
        </footer>
    );
}
