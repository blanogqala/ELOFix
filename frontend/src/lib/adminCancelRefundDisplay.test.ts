import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import {
  getAdminJobCustomerRefundNet,
  getAdminNetEscrowRemaining,
  getAdminNetPaidLaborProviderShare,
  buildAdminJobTransactionHistory,
} from '@/lib/adminJobFinancial';
import {
  getAdminPaymentStatusDisplay,
  isAdminPaymentRefundJob,
  resolveAdminPaymentSettlementStatus,
} from '@/lib/adminJobStatus';

const cancelledCourierJob = {
  id: 'job-1',
  status: 'CANCELLED',
  courierFlow: true,
  laborPaid: true,
  totalPrice: 600,
  commissionAmount: 42,
  providerAmount: 558,
  releasedAmount: 0,
  refundAmount: 558,
  refundStatus: 'recorded',
  cancelledAt: '2026-07-01T10:00:00.000Z',
  cancelledBy: 'customer',
  refundDetails: {
    customerNet: 0,
    cumulativeCustomerNet: 0,
    escrowApplied: 0,
    clawbackApplied: 0,
    providerDebtAdded: 0,
    materialsNet: 0,
    immediateRefund: 0,
    pendingRefund: 0,
    processedAt: null,
  },
} as Job;

describe('admin cancel refund display', () => {
  it('treats recorded cancel refunds as refund settlement', () => {
    expect(isAdminPaymentRefundJob(cancelledCourierJob)).toBe(true);
    expect(resolveAdminPaymentSettlementStatus(cancelledCourierJob)).toBe('refund');
    expect(getAdminPaymentStatusDisplay(cancelledCourierJob).label).toBe('Cancelled · refunded');
  });

  it('zeros provider remaining when held funds refunded on cancel', () => {
    expect(getAdminJobCustomerRefundNet(cancelledCourierJob)).toBe(558);
    expect(getAdminNetEscrowRemaining(cancelledCourierJob)).toBe(0);
    expect(getAdminNetPaidLaborProviderShare(cancelledCourierJob)).toBe(0);
  });

  it('includes cancellation refund in transaction history', () => {
    const rows = buildAdminJobTransactionHistory(cancelledCourierJob);
    const refundRow = rows.find((r) => r.type.includes('cancellation refund'));
    expect(refundRow).toBeDefined();
    expect(refundRow?.amount).toBe(558);
    expect(refundRow?.by).toBe('Customer cancel');
  });
});
