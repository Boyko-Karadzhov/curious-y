// Repository-owned vector art: distinct equipment, silhouettes and textual badges.
import { mkdirSync, writeFileSync } from 'node:fs';
import { UNITS } from '../supabase/functions/_shared/units.ts';
mkdirSync('public/assets/units', { recursive: true });
const weapons = {
  swordsman: '<path d="M45 44V14l5-7 5 7v30M42 34h16"/>',
  archer: '<path d="M45 9Q69 30 45 48l5-19zM41 29h20m-6-5 6 5-6 5"/>',
  knight: '<path d="m43 37 9-19 8 3-3 24H12l3-12 15-4zM16 44v10m36-10v10"/>',
  catapult: '<path d="M10 45h46M19 43l11-22 12 22M29 28 50 9h10v8H49M16 46v9m32-9v9"/>',
  medic: '<path d="M42 17h9v9h9v9h-9v9h-9v-9h-9v-9h9z" fill="#ecfdf5"/>',
  spearman: '<path d="M50 52V16m-5 1L50 4l5 13z"/>',
  shieldbearer: '<path d="M35 17h23v22L47 51 35 39z" fill="#475569"/><path d="M46 22v21m-6-16h13"/>',
  berserker: '<path d="m42 51 9-36m-9 0 17 4 2 13-21-6z"/>',
  duelist: '<path d="m39 45 21-34M36 37l14 9m-12-2-6 8"/>',
  slinger: '<path d="M47 37 40 17q10-15 16 1z"/><circle cx="49" cy="14" r="5"/>',
  crossbowman: '<path d="M48 49V12M35 29q13-23 26 0L48 22zM44 43h10"/>',
  ranger: '<path d="m12 21 12-18 15 18M44 8q22 19 0 39V8m-4 20h19"/>',
  'clockwork-gunner': '<path d="M33 25h28v12H33zM48 25V13h8v12M36 37v12"/><circle cx="46" cy="31" r="8"/><path d="M46 22v18m-9-9h18"/>',
  'scout-rider': '<path d="m8 39 32-6 9-15 11 5-6 24H10zM16 47v8m34-8v8M39 9l18 4-18 8z"/>',
  lancer: '<path d="m9 40 33-5 9-14 9 4-5 22H12zM15 47v8m36-8v8M34 37 60 5m-12 10 9 1-3 7"/>',
  ram: '<path d="M8 28 21 12h26l12 16v16H8z" fill="#475569"/><path d="M5 34h57M14 45v9m36-9v9"/>',
  bombardier: '<circle cx="48" cy="36" r="13" fill="#334155"/><path d="M48 23v-8l8-5m-2-3 8 5m-4-8v12"/>',
  'frost-mage': '<path d="M49 51V11m-10 7h20M42 10l14 16m0-16L42 26M15 20l10-17 11 17z"/>',
  'battle-sage': '<path d="M34 21 47 25l14-4v24l-14 5-13-5zM47 25v25M13 19l11-15 10 15z"/>',
  'astral-colossus': '<path d="m10 42 4-25L25 6h15l12 13 5 23-14 9H22z" fill="#581c87"/><path d="m32 14 4 10 11 2-8 7 2 11-9-6-10 6 2-11-8-7 12-2z" fill="#faf5ff"/>',
};
for (const u of UNITS) {
  const body = u.tags.includes('siege') || u.id === 'astral-colossus' ? '' : `<circle cx="24" cy="19" r="9" fill="#f1d5b5"/><path d="M12 49V31l12-5 12 5v18z" fill="${u.color}"/><path d="M18 49v8m12-8v8"/>`;
  writeFileSync(`public/assets/units/${u.id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 80"><title>${u.name}</title><g stroke="${u.color}" stroke-width="3" stroke-linejoin="round" fill="none">${body}${weapons[u.id]}</g><rect x="4" y="61" width="64" height="18" rx="5" fill="#0f172a"/><text x="36" y="74" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="12" fill="${u.color}">${u.badge}</text></svg>\n`);
}
