import { describe, expect, it } from 'vitest';
import {
  resolveProviderRefundDisplay,
  resolveCustomerRefundDisplay,
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
  it('shows pending from pendingRefund', () => {
    const d = resolveCustomerRefundDisplay({
      refundAmount: 697.5,
      refundDetails: { pendingRefund: 697.5, immediateRefund: 0 },
      customerRefundStatus: 'READY',
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
