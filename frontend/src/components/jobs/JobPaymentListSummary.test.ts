import { describe, expect, it } from 'vitest';
import type { Job, JobPaymentSummary } from '@/types';
import { getJobPaymentListSummaryModel } from '@/lib/jobPaymentListSummaryModel';

function fiftyFifty(over: Partial<JobPaymentSummary> = {}): JobPaymentSummary {
  return {
    mode: 'TWO_PAYMENT_50_50',
    totalAmount: 100,
    deposit: { amount: 50, status: 'PAID' },
    completion: { amount: 50, status: 'UNPAID' },
    totalPaidByCustomer: 50,
    totalRemainingByCustomer: 50,
    providerShareRecorded: 46.5,
    providerShareRemaining: 46.5,
    commissionRecorded: 3.5,
    paymentProgress: 'FIRST_PAID',
    label: 'DEPOSIT_PAID',
    ...over,
  };
}

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    title: 'Tiling',
    category: 'tiling',
    categoryName: 'Tiling',
    description: 'Bathroom tiles',
    status: 'IN_PROGRESS',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    userId: 'u1',
    userName: 'Customer',
    providerId: 'p1',
    totalPrice: 100,
    paymentSummary: fiftyFifty(),
    ...over,
  } as Job;
}

describe('getJobPaymentListSummaryModel', () => {
  it('partial payment compact model has 50% paid and remaining, plus a Paid Rxx line for desktop only', () => {
    const model = getJobPaymentListSummaryModel(job());
    expect(model.amountText).toMatch(/100/);
    expect(model.compactStatusLabel?.toLowerCase()).toContain('50% paid');
    expect(model.remainingAmountText).toMatch(/50/);
    expect(model.showRemainingLine).toBe(true);
    expect(model.showPaidAmountLine).toBe(true);
    expect(model.showPaymentRemainingCue).toBe(true);
    expect(model.paidAmountText).toMatch(/50/);
  });

  it('fully paid displays Fully paid cleanly', () => {
    const model = getJobPaymentListSummaryModel(
      job({
        paymentSummary: fiftyFifty({
          completion: { amount: 50, status: 'PAID' },
          totalPaidByCustomer: 100,
          totalRemainingByCustomer: 0,
          paymentProgress: 'FULLY_PAID',
          label: 'FULLY_PAID',
          providerShareRecorded: 93,
          providerShareRemaining: 0,
        }),
      })
    );
    expect(model.isFullyPaid).toBe(true);
    expect(model.isPartialPaid).toBe(false);
    expect(model.compactStatusLabel).toBe('Fully paid');
    expect(model.showPaidAmountLine).toBe(false);
    expect(model.showRemainingLine).toBe(false);
  });

  it('refund processing wording is retained and is not mixed into paid remaining lines', () => {
    const model = getJobPaymentListSummaryModel(
      job({
        customerRefundStatus: 'REFUND_PROCESSING',
        refundAmount: 50,
        refundDetails: { pendingRefund: 50, immediateRefund: 0 },
      })
    );
    expect(model.refundInFlight).toBe(true);
    expect(model.refundLabel).toMatch(/Refund processing/i);
    expect(model.refundLine).toMatch(/Refund processing/);
    expect(model.showPaidAmountLine).toBe(false);
    expect(model.showRemainingLine).toBe(false);
  });

  it('refunded wording is retained', () => {
    const model = getJobPaymentListSummaryModel(
      job({
        customerRefundStatus: 'REFUND_COMPLETED',
        refundAmount: 100,
        refundDetails: { pendingRefund: 0, immediateRefund: 100 },
      })
    );
    expect(model.processedRefund).toBe(true);
    expect(model.refundLine).toMatch(/Refunded/);
    expect(model.showPaidAmountLine).toBe(false);
  });
});
