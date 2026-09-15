import { describe, expect, it } from 'vitest';
import {
  paymentConfirmedLabel,
  settlementStatusLabel,
  settlementStatusDescription,
  feeIsKnown,
} from '@/lib/payoutDisplay';

describe('payoutDisplay', () => {
  it('does not call a paid PaymentIntent Settled', () => {
    expect(paymentConfirmedLabel('PAID')).toBe('Payment confirmed');
    expect(settlementStatusLabel('PROCESSING')).toBe('Processing');
    expect(settlementStatusLabel('PROCESSING')).not.toBe('Settled');
  });

  it('labels authoritative Paystack settlement', () => {
    expect(settlementStatusLabel('SETTLED')).toBe('Settled by Paystack');
    expect(settlementStatusDescription('SETTLED', '2026-09-15T00:00:00.000Z')).toContain(
      'Bank reflection time can vary'
    );
  });

  it('does not invent unknown fees', () => {
    expect(feeIsKnown(null)).toBe(false);
    expect(feeIsKnown(2.82)).toBe(true);
    expect(settlementStatusLabel('FAILED')).toBe('Failed');
    expect(settlementStatusLabel('REVERSED')).toBe('Reversed');
  });
});
