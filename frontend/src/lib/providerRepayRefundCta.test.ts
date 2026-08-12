import { describe, expect, it } from 'vitest';

/** Mirrors Service Price CTA visibility for provider refund repayment. */
function canShowRepayRefundCta(obligation: {
  amountDue: number;
  pendingRepayment?: { id: string } | null;
} | null): boolean {
  if (!obligation) return false;
  return obligation.amountDue > 0 || Boolean(obligation.pendingRepayment);
}

function repayCtaMode(obligation: {
  amountDue: number;
  pendingRepayment?: { id: string } | null;
  customerRefundStatus?: string | null;
  repaymentStatus?: string | null;
} | null): 'hidden' | 'pending' | 'repay' | 'verified' | 'completed' {
  if (!obligation) return 'hidden';
  const crs = String(obligation.customerRefundStatus || '').toUpperCase();
  if (crs === 'REFUND_COMPLETED') return 'completed';
  if (crs === 'READY' || crs === 'REFUND_READY' || crs === 'REFUND_PROCESSING') return 'verified';
  if (obligation.pendingRepayment && obligation.amountDue > 0) return 'pending';
  if (obligation.amountDue > 0) return 'repay';
  return 'hidden';
}

function repayCtaLabel(obligation: {
  amountDue: number;
  pendingRepayment?: { id: string } | null;
} | null): string | null {
  if (repayCtaMode(obligation) !== 'repay' || !obligation) return null;
  return `Repay R${Number(obligation.amountDue).toFixed(2)}`;
}

describe('provider repay refund CTA', () => {
  it('hides when no obligation', () => {
    expect(repayCtaMode(null)).toBe('hidden');
    expect(repayCtaMode({ amountDue: 0, pendingRepayment: null })).toBe('hidden');
  });

  it('shows repay with amount in label when amount due and no pending submission', () => {
    expect(repayCtaMode({ amountDue: 465, pendingRepayment: null })).toBe('repay');
    expect(repayCtaLabel({ amountDue: 465, pendingRepayment: null })).toBe('Repay R465.00');
  });

  it('shows pending when repayment submitted', () => {
    expect(
      repayCtaMode({ amountDue: 250, pendingRepayment: { id: 'r1' } })
    ).toBe('pending');
  });

  it('shows verified after admin confirm even if leftover pending object', () => {
    expect(
      repayCtaMode({
        amountDue: 0,
        pendingRepayment: { id: 'r1' },
        customerRefundStatus: 'READY',
      })
    ).toBe('verified');
  });
});
