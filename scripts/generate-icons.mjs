import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Standard SVG Icon
const svgStandard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#026ec9" />
      <stop offset="45%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#38a8f8" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#026ec9" flood-opacity="0.3" />
    </filter>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="100" ry="100" fill="url(#bgGrad)" filter="url(#glow)" />
  <text x="256" y="272" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="220" letter-spacing="6">?Y</text>
</svg>`;

// 2. Full Bleed / Maskable SVG Icon (centered within the 80% safe circle)
const svgMaskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGradMask" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#026ec9" />
      <stop offset="45%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#38a8f8" />
    </linearGradient>
  </defs>
  <!-- Full bleed background -->
  <rect width="512" height="512" fill="url(#bgGradMask)" />
  <!-- Centered symbol in the 80% safe zone (safe radius = 204px) -->
  <text x="256" y="266" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="230" letter-spacing="8">?Y</text>
</svg>`;

// 3. Apple Touch Icon SVG (180x180 square full bleed gradient)
const svgApple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="180" height="180">
  <defs>
    <linearGradient id="appleGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#026ec9" />
      <stop offset="45%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#38a8f8" />
    </linearGradient>
  </defs>
  <rect width="180" height="180" fill="url(#appleGrad)" />
  <text x="90" y="96" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Plus Jakarta Sans', 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="82" letter-spacing="3">?Y</text>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgStandard, 'utf8');

// Helper to render HTML with SVG to PNG using headless Edge
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function renderSvgToPng(svgContent, outputPath, width, height) {
  const tempHtml = path.resolve(__dirname, `temp-${width}x${height}.html`);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: ${width}px;
      height: ${height}px;
      display: block;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  fs.writeFileSync(tempHtml, html, 'utf8');

  try {
    const fileUrl = 'file:///' + tempHtml.replace(/\\\\/g, '/');
    const cmd = `"${edgePath}" --headless --disable-gpu --force-device-scale-factor=1 --hide-scrollbars --window-size=${width},${height} --screenshot="${outputPath}" "${fileUrl}"`;
    execSync(cmd, { stdio: 'pipe' });
    console.log(`Generated ${path.basename(outputPath)} (${width}x${height})`);
  } finally {
    if (fs.existsSync(tempHtml)) {
      fs.unlinkSync(tempHtml);
    }
  }
}

// Generate all required icons
console.log('Generating PWA icons...');
renderSvgToPng(svgStandard, path.join(publicDir, 'pwa-512x512.png'), 512, 512);
renderSvgToPng(svgStandard, path.join(publicDir, 'pwa-192x192.png'), 192, 192);
renderSvgToPng(svgMaskable, path.join(publicDir, 'pwa-maskable-512x512.png'), 512, 512);
renderSvgToPng(svgMaskable, path.join(publicDir, 'pwa-maskable-192x192.png'), 192, 192);
renderSvgToPng(svgApple, path.join(publicDir, 'apple-touch-icon.png'), 180, 180);
renderSvgToPng(svgApple, path.join(publicDir, 'apple-touch-icon-180x180.png'), 180, 180);

console.log('All icons generated successfully!');
