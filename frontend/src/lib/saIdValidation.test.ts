import { describe, expect, it } from 'vitest';
import { validateSaId } from '@/lib/saIdValidation';

describe('validateSaId', () => {
  it('accepts a valid SA ID', () => {
    expect(validateSaId('8001015009087')).toBe(true);
  });

  it('rejects an invalid checksum', () => {
    expect(validateSaId('8001015009088')).toBe(false);
  });

  it('rejects too few digits', () => {
    expect(validateSaId('123')).toBe(false);
  });

  it('strips non-digits before validating', () => {
    expect(validateSaId('8001 0150 0908 7')).toBe(true);
  });

  it('rejects the reported invalid provider ID', () => {
    expect(validateSaId('9511255304086')).toBe(false);
    expect(validateSaId('9511255304088')).toBe(true);
  });
});
