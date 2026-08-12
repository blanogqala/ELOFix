import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import { buildJobCancellationFinancials } from './jobCancellationFinancials';

function depositOnlyJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-a',
    laborPaid: true,
    totalPrice: 1000,
    paymentSummary: {
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
    },
    ...overrides,
  } as Job;
}

describe('buildJobCancellationFinancials', () => {
  it('CASE A — deposit only: paid 500, unpaid 500, under review 500', () => {
    const fin = buildJobCancellationFinancials(depositOnlyJob());
    expect(fin.servicePrice).toBe(1000);
    expect(fin.paidToDate).toBe(500);
    expect(fin.unpaidRemaining).toBe(500);
    expect(fin.amountUnderReview).toBe(500);
    expect(fin.commissionOnPaid).toBe(35);
    expect(fin.providerShareOnPaid).toBe(465);
    expect(fin.depositStage?.status).toBe('PAID');
    expect(fin.completionStage?.status).toBe('UNPAID');
    expect(fin.hasPartialPayment).toBe(true);
  });

  it('CASE B — both tranches paid', () => {
    const fin = buildJobCancellationFinancials(
      depositOnlyJob({
        paymentSummary: {
          mode: 'TWO_PAYMENT_50_50',
          totalAmount: 1000,
          deposit: { amount: 500, status: 'PAID' },
          completion: { amount: 500, status: 'PAID' },
          totalPaidByCustomer: 1000,
          totalRemainingByCustomer: 0,
          providerShareRecorded: 930,
          providerShareRemaining: 0,
          commissionRecorded: 70,
          paymentProgress: 'FULLY_PAID',
        },
      })
    );
    expect(fin.paidToDate).toBe(1000);
    expect(fin.unpaidRemaining).toBe(0);
    expect(fin.amountUnderReview).toBe(1000);
    expect(fin.commissionOnPaid).toBe(70);
    expect(fin.providerShareOnPaid).toBe(930);
    expect(fin.hasPartialPayment).toBe(false);
  });

  it('CASE C — no payment', () => {
    const fin = buildJobCancellationFinancials({
      id: 'job-c',
      laborPaid: false,
      totalPrice: 1000,
      paymentSummary: {
        mode: 'TWO_PAYMENT_50_50',
        totalAmount: 1000,
        deposit: { amount: 500, status: 'UNPAID' },
        completion: { amount: 500, status: 'UNPAID' },
        totalPaidByCustomer: 0,
        totalRemainingByCustomer: 1000,
        providerShareRecorded: 0,
        providerShareRemaining: 930,
        commissionRecorded: 0,
        paymentProgress: 'NONE',
      },
    } as Job);
    expect(fin.paidToDate).toBe(0);
    expect(fin.amountUnderReview).toBe(0);
  });

  it('CASE E — prior refund reduces under review', () => {
    const fin = buildJobCancellationFinancials(
      depositOnlyJob({
        refundAmount: 500,
        refundStatus: 'processed',
        refundDetails: { cumulativeCustomerNet: 500 },
      })
    );
    expect(fin.paidToDate).toBe(500);
    expect(fin.amountUnderReview).toBe(0);
  });
});
