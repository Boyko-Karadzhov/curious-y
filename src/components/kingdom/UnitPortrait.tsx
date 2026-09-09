import { useEffect, useState } from 'react';
import { UnitId, unitDefinition, type EquipmentVisual, type Kingdom } from '../../lib/kingdom/game';
import { unitArt } from '../../lib/kingdom/unitArt';
import { drawEquippedUnit, loadEquipmentArtwork } from '../../lib/kingdom/equipmentArt';

export function portraitEquipment(state: Kingdom, id: UnitId): EquipmentVisual {
    const c = unitDefinition(id).unitClass;
    return { weapon: state.forge.equipped[`${c}:weapon`]?.tier ?? 0, armor: c === 'siege' ? 0 : state.forge.equipped[`${c}:armor`]?.tier ?? 0 };
}

const portraits = new Map<string, Promise<string | null>>();
function equippedPortrait(id: UnitId, equipment: EquipmentVisual, size: number) {
    const key = `${id}/${equipment.weapon}/${equipment.armor}/${size}`;
    if (!portraits.has(key)) {
        const result = loadEquipmentArtwork([{ id, equipment }]).then(() => {
            const sheet = document.createElement('canvas'); sheet.width = sheet.height = 512;
            const ctx = sheet.getContext('2d'); if (!ctx) return null;
            ctx.translate(256, 448);
            if (!drawEquippedUnit(ctx, id, equipment, 0, 120)) return null;
            // Fit the complete painted silhouette, including long forged weapons,
            // into the portrait square instead of cropping at the old body bounds.
            const pixels = ctx.getImageData(0, 0, 512, 512).data;
            let left = 512, top = 512, right = 0, bottom = 0;
            for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
                if (pixels[(y * 512 + x) * 4 + 3] > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
            }
            if (left > right) return null;
            const output = document.createElement('canvas'); output.width = output.height = size * 2;
            const out = output.getContext('2d'); if (!out) return null;
            const w = right - left + 1, h = bottom - top + 1, scale = (output.width - 8) / Math.max(w, h);
            out.drawImage(sheet, left, top, w, h, (output.width - w * scale) / 2, (output.height - h * scale) / 2, w * scale, h * scale);
            return output.toDataURL();
        }).catch(() => null);
        if (portraits.size >= 80) portraits.delete(portraits.keys().next().value!);
        portraits.set(key, result);
        void result.then(url => { if (!url && portraits.get(key) === result) portraits.delete(key); });
    }
    return portraits.get(key)!;
}

export function UnitPortrait({ id, size = 80, equipment }: { id: UnitId; size?: number; equipment?: EquipmentVisual }) {
    const unit = unitDefinition(id);
    const weapon = equipment?.weapon ?? 0, armor = equipment?.armor ?? 0;
    const key = `${id}/${weapon}/${armor}/${size}`;
    const [painted, setPainted] = useState<{ key: string; url: string } | null>(null);
    useEffect(() => {
        let disposed = false;
        if (unit?.unitClass !== 'siege' && (weapon || armor)) {
            void equippedPortrait(id, { weapon, armor }, size).then(url => { if (!disposed && url) setPainted({ key, url }); });
        }
        return () => { disposed = true; };
    }, [id, weapon, armor, size, key, unit?.unitClass]);
    return <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        <img src={painted?.key === key ? painted.url : unitArt(id).portrait} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />
        {unit?.unitClass === 'siege' && weapon > 0 && <img src={`/assets/equipment/forge-v1/siege-weapon-${weapon}.png`} alt="" className="absolute bottom-0 left-0 object-contain" style={{ width: size * .35, height: size * .35 }} />}
        {unit && <span aria-hidden="true" className="absolute bottom-0 right-0 rounded bg-slate-950 px-1 text-[10px] font-bold leading-4 ring-1 ring-slate-600" style={{ color: unit.color }}>T{unit.tier}</span>}
    </span>;
}
