import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import {
  computeCancelCommission,
  computeEstimatedNetRefund,
  getCustomerCancelPreview,
  getProviderCancelPreview,
  getCustomerCancelFreeWarningMessage,
  getCustomerCancelForfeitWarningMessage,
  isCourierJobCancellationBlocked,
  netCourierCancelRefundFromGross,
} from '@/lib/jobCancellationPolicy';

function depositOnlyJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-a',
    courierFlow: false,
    laborPaid: true,
    totalPrice: 1000,
    status: 'IN_PROGRESS',
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

describe('jobCancellationPolicy', () => {
  it('computeCancelCommission and computeEstimatedNetRefund use 7%', () => {
    expect(computeCancelCommission(600)).toBe(42);
    expect(computeEstimatedNetRefund(600)).toBe(558);
    expect(netCourierCancelRefundFromGross(600)).toBe(558);
    expect(netCourierCancelRefundFromGross(100)).toBe(93);
  });

  it('CASE A — deposit-only service cancel uses paid tranche amounts', () => {
    const preview = getCustomerCancelPreview(depositOnlyJob(), null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.paidToDate).toBe(500);
    expect(preview.unpaidRemaining).toBe(500);
    expect(preview.amountUnderReview).toBe(500);
    expect(preview.commissionOnPaid).toBe(35);
    expect(preview.providerShareOnPaid).toBe(465);
    expect(preview.refundAmount).toBe(500);
    expect(preview.warning).toContain('unpaid completion payment will not be charged');
  });

  it('CASE D — provider deposit-only dispute preview', () => {
    const preview = getProviderCancelPreview(depositOnlyJob(), null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.amountUnderReview).toBe(500);
    expect(preview.warning).toContain('deposit only');
  });

  it('CASE B — fully paid service cancel', () => {
    const job = depositOnlyJob({
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
    });
    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.amountUnderReview).toBe(1000);
    expect(preview.commissionOnPaid).toBe(70);
    expect(preview.providerShareOnPaid).toBe(930);
  });

  it('getCustomerCancelPreview opens dispute with commission breakdown for paid courier jobs', () => {
    const job = {
      id: 'job-1',
      courierFlow: true,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
      servicePayment: { status: 'paid', amount: 600 },
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.paidToDate).toBe(600);
    expect(preview.amountUnderReview).toBe(600);
    expect(preview.customerForfeits).toBe(false);
  });

  it('getCustomerCancelPreview blocks cancel after pickup', () => {
    const job = {
      id: 'job-2',
      courierFlow: true,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
      servicePayment: { status: 'paid', amount: 600 },
    } as Job;

    const preview = getCustomerCancelPreview(
      job,
      { fulfillmentStatus: 'OUT_FOR_DELIVERY' } as never,
      false
    );
    expect(preview.cancellationBlocked).toBe(true);
    expect(preview.warning).toContain('cannot be cancelled after items have been collected');
  });

  it('getCustomerCancelPreview forfeits labor when courier is collecting', () => {
    const job = {
      id: 'job-2b',
      courierFlow: true,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
      servicePayment: { status: 'paid', amount: 600 },
    } as Job;

    const preview = getCustomerCancelPreview(
      job,
      { fulfillmentStatus: 'COLLECTING' } as never,
      false
    );
    expect(preview.laborRefund).toBe(0);
    expect(preview.customerForfeits).toBe(true);
    expect(preview.warning).toContain('collecting or delivering');
  });

  it('isCourierJobCancellationBlocked returns true for post-pickup and awaiting confirmation', () => {
    const courierJob = { courierFlow: true, status: 'IN_PROGRESS' } as Job;
    expect(
      isCourierJobCancellationBlocked(
        courierJob,
        { fulfillmentStatus: 'COLLECTED' } as never,
        'customer'
      )
    ).toBe(true);
    expect(isCourierJobCancellationBlocked({ courierFlow: false } as Job, null, 'customer')).toBe(
      false
    );
  });

  it('getCustomerCancelPreview shows service unpaid free-cancel message', () => {
    const job = {
      id: 'job-4',
      courierFlow: false,
      laborPaid: false,
      status: 'SERVICE_PRICE_SUBMITTED',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.warning).toBe(getCustomerCancelFreeWarningMessage(job));
    expect(preview.opensDisputeReview).toBeUndefined();
  });

  it('getProviderCancelPreview opens dispute when labor paid via servicePayment legacy', () => {
    const job = {
      id: 'job-7',
      courierFlow: false,
      laborPaid: true,
      totalPrice: 1400,
      status: 'IN_PROGRESS',
      servicePayment: { status: 'paid', amount: 1400 },
      commissionAmount: 98,
      providerAmount: 1302,
    } as Job;

    const preview = getProviderCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.paidToDate).toBe(1400);
    expect(preview.amountUnderReview).toBe(1400);
  });
});
