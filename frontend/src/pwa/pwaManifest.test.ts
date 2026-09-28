import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PRECACHE_URLS } from './cachePolicy';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('PWA manifest and icons', () => {
  const manifest = JSON.parse(readFileSync(resolve(frontendRoot, 'public/site.webmanifest'), 'utf8'));

  it('launches standalone from the site root', () => {
    expect(manifest.name).toBe('EloFix');
    expect(manifest.short_name).toBe('EloFix');
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0A2540');
    expect(manifest.theme_color).toBe('#0A2540');
    expect(manifest.launch_handler.client_mode).toBe('navigate-existing');
  });

  it('points at square any and maskable icons', () => {
    const icons = manifest.icons as Array<{ src: string; sizes: string; purpose: string; type: string }>;
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/pwa/icon-192.png', sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ src: '/pwa/icon-512.png', sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ src: '/pwa/icon-maskable-192.png', sizes: '192x192', purpose: 'maskable' }),
        expect.objectContaining({ src: '/pwa/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
    for (const icon of icons) {
      expect(icon.type).toBe('image/png');
    }
  });

  it('ships square icons and keeps maskable artwork inside the safe circle', async () => {
    const expected: Record<string, { width: number; height: number; maskable?: boolean }> = {
      '/pwa/icon-192.png': { width: 192, height: 192 },
      '/pwa/icon-512.png': { width: 512, height: 512 },
      '/pwa/icon-maskable-192.png': { width: 192, height: 192, maskable: true },
      '/pwa/icon-maskable-512.png': { width: 512, height: 512, maskable: true },
      '/apple-touch-icon.png': { width: 180, height: 180 },
    };

    for (const [url, spec] of Object.entries(expected)) {
      const file = resolve(frontendRoot, 'public', url.slice(1));
      const meta = await sharp(file).metadata();
      expect(meta.width, url).toBe(spec.width);
      expect(meta.height, url).toBe(spec.height);
      if (spec.maskable) {
        await expectMaskableSafeZone(file);
      }
    }
  });

  it('precaches only files that exist in public', () => {
    for (const url of PRECACHE_URLS) {
      const file = resolve(frontendRoot, 'public', url.slice(1));
      expect(readFileSync(file).byteLength, url).toBeGreaterThan(32);
    }
  });
});

async function expectMaskableSafeZone(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = (info.width - 1) / 2;
  const cy = (info.height - 1) / 2;
  const maxRadius = info.width * 0.4;
  const corner = (x: number, y: number) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  for (const [x, y] of [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ] as const) {
    const [r, g, b] = corner(x, y);
    expect(r).toBeGreaterThan(245);
    expect(g).toBeGreaterThan(245);
    expect(b).toBeGreaterThan(245);
  }

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 16) continue;
      if (r > 245 && g > 245 && b > 245) continue;
      const distance = Math.hypot(x - cx, y - cy);
      expect(distance).toBeLessThanOrEqual(maxRadius + 1);
    }
  }
}
