import { UnitId } from '../../lib/kingdom/game';
import { unitArt } from '../../lib/kingdom/unitArt';

export function UnitPortrait({ id, size = 80 }: { id: UnitId; size?: number }) {
  return <img src={unitArt(id).portrait} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
}
