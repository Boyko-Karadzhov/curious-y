import { UnitId, unitDefinition } from '../../lib/kingdom/game';
import { unitArt } from '../../lib/kingdom/unitArt';

export function UnitPortrait({ id, size = 80 }: { id: UnitId; size?: number }) {
  const unit = unitDefinition(id);
  return <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
    <img src={unitArt(id).portrait} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />
    {unit && <span aria-hidden="true" className="absolute bottom-0 right-0 rounded bg-slate-950 px-1 text-[10px] font-bold leading-4 ring-1 ring-slate-600" style={{ color: unit.color }}>T{unit.tier}</span>}
  </span>;
}
