import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import {
  computeCancelCommission,
  computeEstimatedNetRefund,
  getCustomerCancelPreview,
  getProviderCancelPreview,
  getCustomerCancelFreeWarningMessage,
  getCustomerCancelForfeitWarningMessage,
  netCourierCancelRefundFromGross,
} from '@/lib/jobCancellationPolicy';

describe('jobCancellationPolicy', () => {
  it('computeCancelCommission and computeEstimatedNetRefund use 7%', () => {
    expect(computeCancelCommission(600)).toBe(42);
    expect(computeEstimatedNetRefund(600)).toBe(558);
    expect(netCourierCancelRefundFromGross(600)).toBe(558);
    expect(netCourierCancelRefundFromGross(100)).toBe(93);
  });

  it('getCustomerCancelPreview opens dispute with commission breakdown for paid courier jobs', () => {
    const job = {
      id: 'job-1',
      courierFlow: true,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.laborGross).toBe(600);
    expect(preview.commissionAmount).toBe(42);
    expect(preview.estimatedNetRefund).toBe(558);
    expect(preview.laborRefund).toBe(558);
    expect(preview.refundAmount).toBe(558);
    expect(preview.customerForfeits).toBe(false);
  });

  it('getCustomerCancelPreview forfeits labor when courier is en route', () => {
    const job = {
      id: 'job-2',
      courierFlow: true,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
    } as Job;

    const preview = getCustomerCancelPreview(
      job,
      { fulfillmentStatus: 'OUT_FOR_DELIVERY' } as never,
      false
    );
    expect(preview.laborRefund).toBe(0);
    expect(preview.customerForfeits).toBe(true);
    expect(preview.opensDisputeReview).toBeUndefined();
    expect(preview.laborGross).toBeUndefined();
    expect(preview.warning).toContain('collecting or delivering');
  });

  it('getCustomerCancelPreview opens dispute with commission for paid service jobs', () => {
    const job = {
      id: 'job-3',
      courierFlow: false,
      laborPaid: true,
      totalPrice: 1400,
      status: 'ACCEPTED',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.laborGross).toBe(1400);
    expect(preview.commissionAmount).toBe(98);
    expect(preview.estimatedNetRefund).toBe(1302);
    expect(preview.refundAmount).toBe(1302);
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
    expect(preview.warning).toContain('before you pay for the service');
    expect(preview.opensDisputeReview).toBeUndefined();
  });

  it('getCustomerCancelPreview shows courier unpaid free-cancel message', () => {
    const job = {
      id: 'job-5',
      courierFlow: true,
      laborPaid: false,
      status: 'ASSIGNED',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.warning).toBe(getCustomerCancelFreeWarningMessage(job));
    expect(preview.warning).toContain('heads out to collect');
  });

  it('getCustomerCancelPreview opens dispute review for service in-progress cancel', () => {
    const job = {
      id: 'job-6',
      courierFlow: false,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.customerForfeits).toBe(false);
    expect(preview.estimatedNetRefund).toBe(558);
    expect(preview.warning).toContain('open a dispute');
  });

  it('getProviderCancelPreview opens dispute with commission when labor paid', () => {
    const job = {
      id: 'job-7',
      courierFlow: false,
      laborPaid: true,
      totalPrice: 1400,
      status: 'IN_PROGRESS',
    } as Job;

    const preview = getProviderCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBe(true);
    expect(preview.laborGross).toBe(1400);
    expect(preview.commissionAmount).toBe(98);
    expect(preview.estimatedNetRefund).toBe(1302);
    expect(preview.refundAmount).toBe(1302);
  });

  it('getProviderCancelPreview has no dispute when labor unpaid', () => {
    const job = {
      id: 'job-8',
      courierFlow: false,
      laborPaid: false,
      status: 'ASSIGNED',
    } as Job;

    const preview = getProviderCancelPreview(job, null, false);
    expect(preview.opensDisputeReview).toBeUndefined();
    expect(preview.refundAmount).toBe(0);
  });
});
