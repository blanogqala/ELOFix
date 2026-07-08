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
});
