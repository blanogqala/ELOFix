import { describe, expect, it } from 'vitest';
import {
  paymentPaidPercentFromSummary,
  paymentStatusLabelFromSummary,
} from '@/components/jobs/JobPaymentProgressCard';
import { getJobPriceDisplay } from '@/lib/jobUtils';
import type { Job, JobPaymentSummary } from '@/types';

function baseSummary(over: Partial<JobPaymentSummary> = {}): JobPaymentSummary {
  return {
    mode: 'TWO_PAYMENT_50_50',
    totalAmount: 1000,
    deposit: { amount: 500, status: 'PAID' },
    completion: { amount: 500, status: 'UNPAID' },
    totalPaidByCustomer: 500,
    totalRemainingByCustomer: 500,
    providerShareRecorded: 465,
    providerShareRemaining: 465,
    commissionRecorded: 35,
    paymentProgress: 'FIRST_PAID',
    label: 'DEPOSIT_PAID',
    ...over,
  };
}

function jobWithSummary(summary: JobPaymentSummary | null, over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'Tiling',
    category: 'tiling',
    categoryName: 'Tiling',
    description: 'test',
    status: 'IN_PROGRESS',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'u1',
    providerId: 'p1',
    laborPaid: true,
    totalPrice: summary?.totalAmount ?? 1000,
    paymentSummary: summary,
    ...over,
  } as Job;
}

describe('paymentStatusLabelFromSummary', () => {
  it('does not say Fully paid after deposit only; uses amount percent', () => {
    expect(paymentStatusLabelFromSummary(baseSummary())).toBe('50% Paid');
    expect(paymentStatusLabelFromSummary(baseSummary({ label: 'COMPLETION_DUE' }))).toBe('50% Paid');
    expect(paymentPaidPercentFromSummary(baseSummary())).toBe(50);
  });

  it('says Fully paid only when fully paid', () => {
    expect(
      paymentStatusLabelFromSummary(
        baseSummary({
          label: 'FULLY_PAID',
          paymentProgress: 'FULLY_PAID',
          completion: { amount: 500, status: 'PAID' },
          totalPaidByCustomer: 1000,
          totalRemainingByCustomer: 0,
          providerShareRecorded: 930,
          providerShareRemaining: 0,
        })
      )
    ).toBe('Fully paid');
  });

  it('supports 100% upfront without deposit split', () => {
    const upfront = baseSummary({
      mode: 'SINGLE_PAYMENT_UPFRONT',
      deposit: { amount: 1000, status: 'PAID' },
      completion: null,
      totalPaidByCustomer: 1000,
      totalRemainingByCustomer: 0,
      label: 'FULLY_PAID',
      paymentProgress: 'FULLY_PAID',
      providerShareRecorded: 930,
      providerShareRemaining: 0,
    });
    expect(paymentStatusLabelFromSummary(upfront)).toBe('Fully paid');
    expect(paymentPaidPercentFromSummary(upfront)).toBe(100);
  });
});

describe('getJobPriceDisplay paymentSummary', () => {
  it('treats deposit-only as partial, not fully paid', () => {
    const d = getJobPriceDisplay(jobWithSummary(baseSummary()));
    expect(d.isPaid).toBe(false);
    expect(d.isFullyPaid).toBe(false);
    expect(d.isPartialPaid).toBe(true);
    expect(d.paymentStatusLabel).toBe('50% Paid');
    expect(d.paidAmount).toBe(500);
    expect(d.remainingAmount).toBe(500);
  });

  it('marks fully paid when remaining is zero', () => {
    const d = getJobPriceDisplay(
      jobWithSummary(
        baseSummary({
          label: 'FULLY_PAID',
          paymentProgress: 'FULLY_PAID',
          completion: { amount: 500, status: 'PAID' },
          totalPaidByCustomer: 1000,
          totalRemainingByCustomer: 0,
        })
      )
    );
    expect(d.isFullyPaid).toBe(true);
    expect(d.isPaid).toBe(true);
    expect(d.isPartialPaid).toBe(false);
    expect(d.paymentStatusLabel).toBe('Fully paid');
  });

  it('falls back to laborPaid when no summary', () => {
    const d = getJobPriceDisplay(jobWithSummary(null, { laborPaid: true, paymentSummary: null }));
    expect(d.isPaid).toBe(true);
    expect(d.isFullyPaid).toBe(true);
  });
});
