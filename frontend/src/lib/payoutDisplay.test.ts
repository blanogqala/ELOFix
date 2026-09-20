import { describe, expect, it } from 'vitest';
import {
  paymentConfirmedLabel,
  settlementStatusLabel,
  settlementStatusDescription,
  feeIsKnown,
  providerGrossShareDisclaimer,
  PROVIDER_EARNINGS_SUBTITLE,
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
    expect(settlementStatusDescription('SETTLED')).toContain('Paystack has completed this payout');
    expect(settlementStatusDescription('SETTLED')).not.toMatch(/Money received in your bank/i);
    expect(settlementStatusLabel('PENDING')).toBe('Awaiting Paystack payout record');
    expect(settlementStatusDescription('PENDING')).toBe(
      'Payment confirmed. EloFix has not yet received or matched the Paystack settlement record.'
    );
    expect(settlementStatusLabel('PENDING', 'gps_1')).toBe('Pending at Paystack');
    expect(settlementStatusDescription('PENDING', null, 'gps_1')).toBe(
      'Payment confirmed. This payout is pending at Paystack.'
    );
    expect(settlementStatusDescription('PROCESSING')).toBe(
      'Paystack is processing this payout. Bank reflection time can vary.'
    );
    expect(settlementStatusLabel('FAILED')).toBe('Settlement issue');
  });

  it('does not invent unknown fees', () => {
    expect(feeIsKnown(null)).toBe(false);
    expect(feeIsKnown(2.82)).toBe(true);
    expect(settlementStatusLabel('FAILED')).toBe('Settlement issue');
    expect(settlementStatusLabel('REVERSED')).toBe('Reversed');
  });

  it('describes 93% as gross marketplace share, not the final bank amount', () => {
    const text = providerGrossShareDisclaimer('R50.00', 'R46.50');
    expect(text).toContain('After the 7% EloFix commission');
    expect(text).toContain('R46.50 (93%)');
    expect(text).toContain('not the final bank amount');
    expect(text).not.toMatch(/after EloFix commission \(93%\)/);
  });

  it('does not use the outdated split-capable gateway earnings subtitle', () => {
    expect(PROVIDER_EARNINGS_SUBTITLE).not.toMatch(/until a split-capable gateway is connected/i);
    expect(PROVIDER_EARNINGS_SUBTITLE).toMatch(/Paystack payout status is tracked separately/i);
  });
});
