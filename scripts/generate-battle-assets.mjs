import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Original, editable vector assets. Rasterized once by the browser and reused
// by the battlefield canvas; no external image service or runtime dependency.
const directory = fileURLToPath(new URL('../public/assets/battle/', import.meta.url));
mkdirSync(directory, { recursive: true });
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`.replace(/[ \t]+$/gm, '');
const wheel = x => `<circle cx="${x}" cy="72" r="10" fill="#332f35" stroke="#202936" stroke-width="3"/><circle cx="${x}" cy="72" r="6" fill="#ad7846"/><path d="M${x - 6} 72h12m-6-6v12" stroke="#60452f" stroke-width="2"/><circle cx="${x}" cy="72" r="2" fill="#e1bb70"/>`;
for (const [team, color] of [['blue', '#48a6c7'], ['red', '#cb5e65']]) {
  const frames = [0, 0, 0, 40, 100, 100, 70, 30].map((angle, frame) => `<g transform="translate(${frame * 96},0)" stroke-linejoin="round">
    <ellipse cx="47" cy="81" rx="35" ry="5" fill="#182735" opacity=".25"/>
    <path d="M23 66L42 35h10l22 31" fill="none" stroke="#322e30" stroke-width="10"/>
    <path d="M23 66L42 35h10l22 31" fill="none" stroke="#bb8850" stroke-width="5"/>
    <path d="M24 60h45v11H24z" fill="#6e4b34" stroke="#322e30" stroke-width="3"/>
    <path d="M30 61h33v4H30z" fill="#dbad62"/>
    <g transform="translate(48,49) rotate(${angle})">
      <path d="M8 8L-27-23" stroke="#322e30" stroke-width="10"/>
      <path d="M8 8L-27-23" stroke="#d7a65e" stroke-width="5"/>
      <path d="M-35-28q6 15 17 5l-2-6z" fill="#815436" stroke="#322e30" stroke-width="3"/>
      ${frame < 4 ? '<path d="M-32-29l4-6 8 2 2 6-7 4z" fill="#9daeb7" stroke="#425265" stroke-width="2"/>' : ''}
    </g>
    <path d="M41 50h13v17l-6 5-7-5z" fill="${color}" stroke="#253b50" stroke-width="2"/>
    <circle cx="48" cy="49" r="5" fill="#e3c586" stroke="#41362e" stroke-width="2"/>
    ${wheel(26)}${wheel(69)}
  </g>`).join('');
  writeFileSync(`${directory}/catapult-${team}.svg`, svg(768, 96, frames));
  writeFileSync(`${directory}/horse-${team}.svg`, svg(64, 64, `<g stroke="#342d31" stroke-width="2" stroke-linejoin="round">
    <path d="M17 33L7 43 9 29 18 27" fill="#453238"/>
    <path d="M19 40l-4 16h6l7-15m10-1 5 16h6l-3-20" fill="#95613e"/>
    <path d="M16 25q10-7 24 2l5-14 9-4 4 7-1 14-10 3-3 11-24-1z" fill="#b88150"/>
    <path d="M43 17l1-8 6 4m-6 5-7 11" fill="#453238"/>
    <path d="M23 25h15v19H23z" fill="${color}"/>
    <path d="M23 28h15m-11 3v9" stroke="#e6cc87"/>
    <path d="M15 54h7m21 0h7M48 26l9 1" fill="none"/>
    <circle cx="52" cy="18" r="1" fill="#171f2c" stroke="none"/>
  </g>`));
}
writeFileSync(`${directory}/arrow.svg`, svg(32, 10, '<path d="M3 5h23" stroke="#40332e" stroke-width="3"/><path d="M5 5h21" stroke="#ecd1a0"/><path d="M23 1l8 4-8 4 2-4z" fill="#e1eced" stroke="#334b5e"/><path d="M2 1l7 4-7 4 1-4z" fill="#f3e5c2" stroke="#635845"/>'));
writeFileSync(`${directory}/stone.svg`, svg(20, 20, '<path d="M2 7l5-5 8 1 4 7-4 8-9-1-5-5z" fill="#788a97" stroke="#344655" stroke-width="2"/><path d="M4 7l4-3 6 1-3 5-6 2z" fill="#bdc8cb"/><path d="M11 11l6-2-3 7-7-1z" fill="#526779"/>'));
