import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import { buildJobCancellationFinancials } from './jobCancellationFinancials';
import { canShowLaborPayCta } from './paymentSchedule';

/**
 * Reject-completion UX helpers: paid-tranche snapshot for the dispute modal
 * and dual-CTA gating while awaiting confirmation.
 */
describe('reject completion dispute financials', () => {
  const depositAwaitingJob = {
    id: 'job-rej',
    status: 'AWAITING_CONFIRMATION',
    laborPaid: true,
    nextLaborPaymentType: 'COMPLETION',
    secondPaymentAmount: 500,
    paymentProgress: 'FIRST_PAID',
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
  } as Job;

  it('shows pay CTA while completion is due (dual CTA companion)', () => {
    expect(canShowLaborPayCta(depositAwaitingJob)).toBe(true);
  });

  it('dispute amount under review is deposit only (not full quote)', () => {
    const fin = buildJobCancellationFinancials(depositAwaitingJob);
    expect(fin.servicePrice).toBe(1000);
    expect(fin.paidToDate).toBe(500);
    expect(fin.unpaidRemaining).toBe(500);
    expect(fin.amountUnderReview).toBe(500);
    expect(fin.completionStage?.status).toBe('UNPAID');
  });

  it('hides labor pay CTA when nextLaborPaymentType cleared after dispute', () => {
    const disputed = {
      ...depositAwaitingJob,
      status: 'DISPUTED',
      nextLaborPaymentType: null,
    } as Job;
    expect(canShowLaborPayCta(disputed)).toBe(false);
  });
});
