import { keepAppearance } from '../../lib/kingdom/game';

/** Local pixel art with structural layers; no motion needed to show progression. */
export function KeepVisual({ level, compact = false }: { level: number; compact?: boolean }) {
  return <div role="img" aria-label={`Keep level ${level}: ${keepAppearance(level)}`} className={`relative flex shrink-0 items-end justify-center ${compact ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-40 w-48'}`}>
    {level >= 2 && <div aria-hidden="true" className="absolute bottom-2 h-8 w-[90%] rounded-t-lg border-4 border-slate-400 bg-slate-600" />}
    {level >= 3 && <div aria-hidden="true" className="absolute bottom-3 flex w-full justify-between"><span className="h-16 w-5 rounded-t border-4 border-slate-300 bg-slate-500" /><span className="h-16 w-5 rounded-t border-4 border-slate-300 bg-slate-500" /></div>}
    <img aria-hidden="true" src="/assets/tiny-swords/castle-blue.png" alt="" className="pixel-art relative w-full" style={{ transform: `scale(${0.8 + level * 0.04})`, filter: level >= 4 ? 'drop-shadow(0 0 5px #fcd34d)' : undefined }} />
    {level >= 4 && <span aria-hidden="true" className="absolute left-1 top-4 text-xl text-amber-300">⚑</span>}
    {level === 5 && <span aria-hidden="true" className="absolute top-0 text-3xl text-amber-300">♛</span>}
  </div>;
}
