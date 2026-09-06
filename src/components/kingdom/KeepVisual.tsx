import { keepAppearance } from '../../lib/kingdom/game';
import { keepArt } from '../../lib/kingdom/buildingArt';

/** Each Keep tier has a complete painted silhouette instead of CSS additions. */
export function KeepVisual({ level, compact = false, enemy = false }: { level: number; compact?: boolean; enemy?: boolean }) {
  return <div role="img" aria-label={enemy ? 'Enemy Keep' : `Keep level ${level}: ${keepAppearance(level)}`} className={`relative flex shrink-0 items-end justify-center ${compact ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-40 w-48'}`}>
    <img aria-hidden="true" src={keepArt(level, enemy)} alt="" width="512" height="512" className="relative h-full w-full object-contain" />
  </div>;
}
