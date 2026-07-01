import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import {
  getCustomerCancelPreview,
  netCourierCancelRefundFromGross,
} from '@/lib/jobCancellationPolicy';

describe('jobCancellationPolicy', () => {
  it('netCourierCancelRefundFromGross deducts 7% commission', () => {
    expect(netCourierCancelRefundFromGross(600)).toBe(558);
    expect(netCourierCancelRefundFromGross(100)).toBe(93);
  });

  it('getCustomerCancelPreview refunds 93% net for paid courier delivery jobs', () => {
    const job = {
      id: 'job-1',
      courierFlow: true,
      laborPaid: true,
      totalPrice: 600,
      status: 'IN_PROGRESS',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
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
  });

  it('getCustomerCancelPreview refunds full gross for non-courier jobs', () => {
    const job = {
      id: 'job-3',
      courierFlow: false,
      laborPaid: true,
      totalPrice: 600,
      status: 'ACCEPTED',
    } as Job;

    const preview = getCustomerCancelPreview(job, null, false);
    expect(preview.laborRefund).toBe(600);
    expect(preview.refundAmount).toBe(600);
  });
});
