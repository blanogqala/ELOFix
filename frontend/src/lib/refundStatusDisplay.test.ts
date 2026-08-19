import { describe, expect, it } from 'vitest';
import {
  resolveProviderRefundDisplay,
  resolveCustomerRefundDisplay,
  isJobRefundUnsettled,
  getRefundBlocksDeleteMessage,
  PAYMENTS_NAV_TYPES,
} from '@/lib/refundStatusDisplay';
import { hasPaymentsNavActivity } from '@/lib/jobActivityIndicators';
import type { AppNotification } from '@/types';

describe('resolveProviderRefundDisplay', () => {
  it('never shows awaiting verification after READY', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 0,
      pendingRepayment: { id: 'x', status: 'SUBMITTED' },
      repaymentStatus: 'AWAITING_VERIFICATION',
      customerRefundStatus: 'READY',
      jobId: 'job-1',
    });
    expect(d.mode).toBe('verified_pending_customer');
    expect(d.label).toMatch(/verified/i);
    expect(d.showRepayCta).toBe(false);
  });

  it('shows required + repay when amount due and no pending', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 697.5,
      pendingRepayment: null,
      repaymentStatus: 'REFUND_DUE',
      customerRefundStatus: null,
    });
    expect(d.mode).toBe('required');
    expect(d.showRepayCta).toBe(true);
  });

  it('shows awaiting only while submitted and owed', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 100,
      pendingRepayment: { id: 'p1', status: 'SUBMITTED', jobId: 'job-1' },
      repaymentStatus: 'AWAITING_VERIFICATION',
      customerRefundStatus: null,
      jobId: 'job-1',
    });
    expect(d.mode).toBe('awaiting_verification');
  });

  it('shows customer refund completed', () => {
    const d = resolveProviderRefundDisplay({
      amountDue: 0,
      pendingRepayment: null,
      repaymentStatus: 'REFUNDED',
      customerRefundStatus: 'REFUND_COMPLETED',
    });
    expect(d.mode).toBe('customer_completed');
  });
});

describe('resolveCustomerRefundDisplay', () => {
  it('shows processing after provider repayment is verified', () => {
    const d = resolveCustomerRefundDisplay({
      refundAmount: 232.5,
      refundDetails: { pendingRefund: 232.5, immediateRefund: 0 },
      customerRefundStatus: 'REFUND_MANUAL_ACTION_REQUIRED',
    });
    expect(d.mode).toBe('processing');
    expect(d.label).toBe('Refund processing');
  });

  it('shows processing for READY', () => {
    const d = resolveCustomerRefundDisplay({
      refundAmount: 697.5,
      refundDetails: { pendingRefund: 697.5, immediateRefund: 0 },
      customerRefundStatus: 'READY',
    });
    expect(d.mode).toBe('processing');
    expect(d.label).toBe('Refund processing');
  });

  it('shows pending when recovery is still waiting on the provider', () => {
    const d = resolveCustomerRefundDisplay({
      refundAmount: 232.5,
      refundDetails: { pendingRefund: 232.5, immediateRefund: 0 },
    });
    expect(d.mode).toBe('pending');
    expect(d.label).toBe('Refund pending');
  });

  it('shows completed from REFUND_COMPLETED', () => {
    const d = resolveCustomerRefundDisplay({
      refundAmount: 697.5,
      customerRefundStatus: 'REFUND_COMPLETED',
      refundCompletedAt: '2026-08-11T10:00:00.000Z',
      refundDetails: { pendingRefund: 0, immediateRefund: 697.5 },
    });
    expect(d.mode).toBe('completed');
    expect(d.label).toBe('Refunded');
  });
});

describe('isJobRefundUnsettled', () => {
  it('blocks delete when refund is pending', () => {
    expect(
      isJobRefundUnsettled({
        refundAmount: 232.5,
        refundDetails: { pendingRefund: 232.5, immediateRefund: 0 },
      })
    ).toBe(true);
  });

  it('blocks delete while customer refund is still processing', () => {
    expect(
      isJobRefundUnsettled({
        refundAmount: 232.5,
        refundDetails: { pendingRefund: 232.5, immediateRefund: 0 },
        customerRefundStatus: 'REFUND_MANUAL_ACTION_REQUIRED',
      })
    ).toBe(true);
  });

  it('blocks delete when refund failed', () => {
    expect(
      isJobRefundUnsettled({
        refundAmount: 232.5,
        customerRefundStatus: 'REFUND_FAILED',
      })
    ).toBe(true);
  });

  it('blocks delete when provider still owes clawback', () => {
    expect(
      isJobRefundUnsettled({
        customerRefundStatus: 'REFUND_COMPLETED',
        refundDetails: { pendingRefund: 0, immediateRefund: 232.5 },
        providerRefundDebt: 232.5,
      })
    ).toBe(true);
  });

  it('allows delete when refund is completed and no provider debt', () => {
    expect(
      isJobRefundUnsettled({
        refundAmount: 232.5,
        customerRefundStatus: 'REFUND_COMPLETED',
        refundDetails: { pendingRefund: 0, immediateRefund: 232.5 },
        providerRefundDebt: 0,
      })
    ).toBe(false);
  });

  it('allows delete when there is no refund', () => {
    expect(isJobRefundUnsettled({})).toBe(false);
  });

  it('returns the shared delete-block message', () => {
    expect(getRefundBlocksDeleteMessage()).toBe(
      'This job cannot be removed until the pending refund is fully settled.'
    );
  });
});

describe('Payments orange-dot types', () => {
  it('lights for refund_processed but not refund_approved', () => {
    const processed: AppNotification = {
      id: '1',
      type: 'refund_processed',
      title: 'Refund',
      message: 'done',
      read: false,
      createdAt: new Date().toISOString(),
    } as AppNotification;
    const approved: AppNotification = {
      ...processed,
      id: '2',
      type: 'refund_approved',
    } as AppNotification;
    expect(hasPaymentsNavActivity([processed])).toBe(true);
    expect(hasPaymentsNavActivity([approved])).toBe(false);
    expect(PAYMENTS_NAV_TYPES).not.toContain('refund_approved');
  });
});
