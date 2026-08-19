import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import { getJobPriceDisplay } from '@/lib/jobUtils';

describe('getJobPriceDisplay disputed jobs', () => {
  it('hides refund amounts while job is DISPUTED', () => {
    const job = {
      id: 'job-1',
      status: 'DISPUTED',
      laborPaid: true,
      totalPrice: 1400,
      refundAmount: 651,
      refundStatus: 'processed',
      cancellationSource: 'customer_cancel',
    } as Job;

    const display = getJobPriceDisplay(job);
    expect(display.refundAmount).toBeUndefined();
    expect(display.refundStatus).toBeUndefined();
    expect(display.underAdminReview).toBe(true);
    expect(display.isPaid).toBe(true);
  });

  it('shows refund after job is cancelled and resolved', () => {
    const job = {
      id: 'job-2',
      status: 'CANCELLED',
      laborPaid: true,
      totalPrice: 1400,
      refundAmount: 651,
      refundStatus: 'processed',
    } as Job;

    const display = getJobPriceDisplay(job);
    expect(display.refundAmount).toBe(651);
    expect(display.refundStatus).toBe('processed');
    expect(display.underAdminReview).toBeFalsy();
  });

  it('does not show Price pending inspection for a rejected courier with no quote', () => {
    const job = {
      id: 'job-courier-rej',
      status: 'REJECTED',
      courierFlow: true,
      totalPrice: 0,
    } as Job;

    const display = getJobPriceDisplay(job);
    expect(display.text).toBe('Rejected');
    expect(display.text).not.toBe('Price pending inspection');
  });

  it('does not show Price pending inspection for a cancelled job with no amount', () => {
    const job = {
      id: 'job-cancel-empty',
      status: 'CANCELLED',
      courierFlow: true,
      totalPrice: 0,
    } as Job;

    const display = getJobPriceDisplay(job);
    expect(display.text).toBe('Cancelled');
  });
});
