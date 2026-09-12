import { describe, expect, it } from 'vitest';
import { resolveProviderRefundDisplay } from '@/lib/refundStatusDisplay';

describe('provider repay refund CTA', () => {
  it('hides when no obligation', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 0,
      pendingRepayment: null,
    });
    expect(d.showRepayCta).toBe(false);
    expect(d.mode).toBe('hidden');
  });

  it('shows repay with amount due and no pending submission', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 465,
      pendingRepayment: null,
      repaymentStatus: 'REFUND_DUE',
    });
    expect(d.showRepayCta).toBe(true);
    expect(d.ctaLabel).toBe('Repay');
  });

  it('shows Continue payment for unpaid PENDING gateway repayment', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 232.5,
      pendingRepayment: {
        id: 'r1',
        status: 'SUBMITTED',
        method: 'GATEWAY',
        paymentIntentState: 'PENDING',
        gatewayPaymentVerified: false,
      },
      repaymentStatus: 'REFUND_DUE',
    });
    expect(d.showRepayCta).toBe(true);
    expect(d.processing).toBe(false);
    expect(d.ctaLabel).toBe('Continue payment');
  });

  it('hides repay after gateway payment is authoritatively PAID', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 232.5,
      pendingRepayment: {
        id: 'r1',
        status: 'SUBMITTED',
        method: 'GATEWAY',
        paymentIntentState: 'PAID',
        gatewayPaymentVerified: true,
      },
      repaymentStatus: 'AWAITING_VERIFICATION',
    });
    expect(d.showRepayCta).toBe(false);
    expect(d.mode).toBe('awaiting_verification');
  });

  it('shows pending when manual transfer submitted', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 250,
      pendingRepayment: { id: 'r1', status: 'SUBMITTED', method: 'BANK_TRANSFER' },
    });
    expect(d.mode).toBe('awaiting_verification');
    expect(d.showRepayCta).toBe(false);
  });

  it('shows verified after admin confirm even if leftover pending object', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 0,
      pendingRepayment: { id: 'r1', status: 'SUBMITTED' },
      customerRefundStatus: 'READY',
    });
    expect(d.mode).toBe('verified_pending_customer');
    expect(d.showRepayCta).toBe(false);
  });

  it('returning from cancel and refetching unpaid attempt keeps CTA', () => {
    const afterCancel = resolveProviderRefundDisplay({
      amountDue: 232.5,
      pendingRepayment: {
        id: 'r1',
        status: 'SUBMITTED',
        method: 'GATEWAY',
        gatewayProvider: 'PAYFAST',
        paymentIntentState: 'PENDING',
        gatewayPaymentVerified: false,
      },
      repaymentStatus: 'REFUND_DUE',
    });
    expect(afterCancel.showRepayCta).toBe(true);
    expect(afterCancel.ctaLabel).toBe('Continue payment');
  });
});
