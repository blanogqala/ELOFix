/**
 * One-off script: trims excess black background from the logo PNG.
 * Run from frontend: npx sharp-cli or node scripts/trim-logo.mjs (after npm i -D sharp)
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { renameSync, existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetPath = path.join(__dirname, '../src/assets/elofix-logo-light.png');

// Trim black background; threshold so near-black edges are removed
const tmpPath = assetPath + '.tmp';
await sharp(assetPath)
  .trim({ threshold: 30 })
  .png()
  .toFile(tmpPath);
if (existsSync(tmpPath)) {
  renameSync(tmpPath, assetPath);
  console.log('Trimmed logo saved:', assetPath);
} else {
  console.error('Trim failed');
  process.exit(1);
}
