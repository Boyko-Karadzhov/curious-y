import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Original, editable vector assets. Rasterized once by the browser and reused
// by the battlefield canvas; no external image service or runtime dependency.
const directory = fileURLToPath(new URL('../public/assets/battle/', import.meta.url));
mkdirSync(directory, { recursive: true });
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>\n`.replace(/[ \t]+$/gm, '');
writeFileSync(`${directory}/arrow.svg`, svg(32, 10, '<path d="M3 5h23" stroke="#40332e" stroke-width="3"/><path d="M5 5h21" stroke="#ecd1a0"/><path d="M23 1l8 4-8 4 2-4z" fill="#e1eced" stroke="#334b5e"/><path d="M2 1l7 4-7 4 1-4z" fill="#f3e5c2" stroke="#635845"/>'));
writeFileSync(`${directory}/stone.svg`, svg(20, 20, '<path d="M2 7l5-5 8 1 4 7-4 8-9-1-5-5z" fill="#788a97" stroke="#344655" stroke-width="2"/><path d="M4 7l4-3 6 1-3 5-6 2z" fill="#bdc8cb"/><path d="M11 11l6-2-3 7-7-1z" fill="#526779"/>'));
