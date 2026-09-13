import { describe, expect, it } from 'vitest';
import {
  canAbandonUnpaidPayfastAttempt,
  canResolveLatePayfastReconciliation,
  canRetryCustomerRefund,
  confirmCustomerRefundToast,
} from '@/lib/adminRefundRepaymentUi';

describe('canAbandonUnpaidPayfastAttempt', () => {
  it('uses the server flag when present', () => {
    expect(canAbandonUnpaidPayfastAttempt({ canAbandonUnpaidPayfastAttempt: true })).toBe(true);
    expect(
      canAbandonUnpaidPayfastAttempt({
        status: 'SUBMITTED',
        method: 'GATEWAY',
        gatewayProvider: 'PAYFAST',
        paymentIntentState: 'PENDING',
        canAbandonUnpaidPayfastAttempt: false,
      })
    ).toBe(false);
  });

  it('derives unpaid PayFast pending when the server flag is omitted', () => {
    expect(
      canAbandonUnpaidPayfastAttempt({
        status: 'SUBMITTED',
        method: 'GATEWAY',
        gatewayProvider: 'PAYFAST',
        paymentIntentState: 'PENDING',
      })
    ).toBe(true);
    expect(
      canAbandonUnpaidPayfastAttempt({
        status: 'SUBMITTED',
        method: 'GATEWAY',
        gatewayProvider: 'PAYFAST',
        paymentIntentState: 'PAID',
      })
    ).toBe(false);
  });
});

describe('canResolveLatePayfastReconciliation', () => {
  it('uses the server flag or required reconciliation state', () => {
    expect(canResolveLatePayfastReconciliation({ canResolveLatePayfastReconciliation: true })).toBe(
      true
    );
    expect(
      canResolveLatePayfastReconciliation({ latePayfastReconciliation: { required: true } })
    ).toBe(true);
    expect(
      canResolveLatePayfastReconciliation({ latePayfastReconciliation: { required: false } })
    ).toBe(false);
  });
});

describe('canRetryCustomerRefund', () => {
  it('hides History action for READY after confirm already processed', () => {
    expect(canRetryCustomerRefund('READY')).toBe(false);
  });

  it('hides History action when customer refund completed', () => {
    expect(canRetryCustomerRefund('REFUND_COMPLETED')).toBe(false);
  });

  it('shows Retry for failed or manual gateway outcomes', () => {
    expect(canRetryCustomerRefund('REFUND_FAILED')).toBe(true);
    expect(canRetryCustomerRefund('REFUND_MANUAL_ACTION_REQUIRED')).toBe(true);
  });
});

describe('confirmCustomerRefundToast', () => {
  it('reports completed refund after confirm', () => {
    const t = confirmCustomerRefundToast('REFUND_COMPLETED');
    expect(t.description).toMatch(/completed/i);
  });

  it('asks for History retry when gateway needs manual action', () => {
    const t = confirmCustomerRefundToast('REFUND_MANUAL_ACTION_REQUIRED');
    expect(t.description).toMatch(/retry/i);
  });
});
