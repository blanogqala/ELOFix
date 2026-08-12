import { describe, expect, it } from 'vitest';
import {
  ADMIN_RESOLUTION_ACTIONS,
  ADMIN_RESOLUTION_HELP,
} from './adminResolutionActions';

describe('adminResolutionActions', () => {
  it('exposes exactly four canonical resolution actions', () => {
    expect(ADMIN_RESOLUTION_ACTIONS).toHaveLength(4);
    expect(ADMIN_RESOLUTION_ACTIONS.map((a) => a.value)).toEqual([
      'RELEASE_FUNDS',
      'FULL_REFUND',
      'RETURN_PROVIDER',
      'CLOSE_CASE',
    ]);
  });

  it('uses production labels without partial/full refund wording', () => {
    const labels = ADMIN_RESOLUTION_ACTIONS.map((a) => a.label);
    expect(labels).toContain('Release remaining funds to provider');
    expect(labels).toContain('Refund customer');
    expect(labels).toContain('Return provider to site');
    expect(labels).toContain('Close case');
    expect(labels.some((l) => /partial refund/i.test(l))).toBe(false);
    expect(labels.some((l) => /^full refund$/i.test(l))).toBe(false);
    expect(labels.some((l) => l === 'Release funds')).toBe(false);
  });

  it('includes shared help copy for paid-only refunds', () => {
    expect(ADMIN_RESOLUTION_HELP).toMatch(/paid amounts only/i);
    expect(ADMIN_RESOLUTION_HELP).toMatch(/30-day/i);
  });
});
