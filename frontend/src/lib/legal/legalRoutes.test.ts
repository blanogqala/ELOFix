import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL_LEGACY_REDIRECTS, LEGAL_ROUTES } from './versions';

const here = dirname(fileURLToPath(import.meta.url));

describe('payment-schedule route compatibility', () => {
  it('keeps the internal document id while publishing /payment-schedule', () => {
    expect(LEGAL_ROUTES['escrow-policy']).toBe('/payment-schedule');
    expect(LEGAL_LEGACY_REDIRECTS['/escrow-policy']).toBe('/payment-schedule');
  });

  it('App.tsx mounts the canonical route and redirects the legacy path', () => {
    const app = readFileSync(resolve(here, '../../App.tsx'), 'utf8');
    expect(app).toContain("LEGAL_ROUTES['escrow-policy']");
    expect(app).toContain('LEGAL_LEGACY_REDIRECTS');
    expect(app).toMatch(/Navigate to=\{to\} replace/);
  });
});
