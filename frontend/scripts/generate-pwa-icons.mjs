/**
 * Build square PWA icons from frontend/public/favicon.ico.
 * That file is PNG artwork with an .ico extension (EloFix hexagon, transparent background).
 *
 * The mark is taller than it is wide and its dark-blue face is close to #0A2540,
 * so icons sit on white. Maskable icons use extra padding so the hexagon stays
 * inside the center 80% safe circle.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(frontendRoot, 'public', 'favicon.ico');
const pwaDir = join(frontendRoot, 'public', 'pwa');
const white = { r: 255, g: 255, b: 255, alpha: 1 };

async function renderIcon(size, innerScale, outFile) {
  const inner = Math.round(size * innerScale);
  const logo = await sharp(source)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: white },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(outFile);
}

mkdirSync(pwaDir, { recursive: true });

const anyScale = 0.86;
const maskableScale = 0.68;

await renderIcon(192, anyScale, join(pwaDir, 'icon-192.png'));
await renderIcon(512, anyScale, join(pwaDir, 'icon-512.png'));
await renderIcon(192, maskableScale, join(pwaDir, 'icon-maskable-192.png'));
await renderIcon(512, maskableScale, join(pwaDir, 'icon-maskable-512.png'));
await renderIcon(180, anyScale, join(frontendRoot, 'public', 'apple-touch-icon.png'));

console.log('[pwa-icons] Wrote 192, 512, maskable, and apple-touch-icon from favicon.ico');
