import { describe, expect, it } from 'vitest';
import { isPaymentProvider, pickPreferredPaymentProvider } from '@/lib/api/payments';

describe('payment provider discovery helpers', () => {
  it('accepts only known providers', () => {
    expect(isPaymentProvider('PAYSTACK')).toBe(true);
    expect(isPaymentProvider('PAYFAST')).toBe(true);
    expect(isPaymentProvider('UNKNOWN')).toBe(false);
  });

  it('prefers PayFast when available, otherwise the first returned provider', () => {
    expect(pickPreferredPaymentProvider(['PAYSTACK', 'PAYFAST'])).toBe('PAYFAST');
    expect(pickPreferredPaymentProvider(['PAYSTACK'])).toBe('PAYSTACK');
    expect(pickPreferredPaymentProvider([])).toBe('');
  });
});
