import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_ROUTES } from './legal/versions';

const appSource = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../App.tsx'), 'utf8');

describe('public compliance routes', () => {
  it('registers contact, returns alias, and delivery policy without AuthGuard', () => {
    expect(appSource).toContain('path="/contact"');
    expect(appSource).toContain('path="/returns-policy"');
    expect(appSource).toContain('path="/delivery-policy"');
    expect(appSource).toContain('path="/refund-policy"');
    expect(appSource).toContain('path="/terms"');
    expect(appSource).toContain('path="/privacy"');
    expect(appSource).toContain('path="/provider-agreement"');
    expect(appSource).toContain('path="/supplier-agreement"');

    const contactBlock = appSource.slice(
      appSource.indexOf('path="/contact"'),
      appSource.indexOf('path="/contact"') + 180,
    );
    expect(contactBlock).not.toContain('AuthGuard');

    const returnsBlock = appSource.slice(
      appSource.indexOf('path="/returns-policy"'),
      appSource.indexOf('path="/returns-policy"') + 200,
    );
    expect(returnsBlock).toContain('RefundPolicyPage');
    expect(returnsBlock).not.toContain('AuthGuard');
  });

  it('keeps canonical legal routes for indexed documents', () => {
    expect(LEGAL_ROUTES.terms).toBe('/terms');
    expect(LEGAL_ROUTES.privacy).toBe('/privacy');
    expect(LEGAL_ROUTES['refund-policy']).toBe('/refund-policy');
    expect(LEGAL_ROUTES['delivery-policy']).toBe('/delivery-policy');
  });
});
