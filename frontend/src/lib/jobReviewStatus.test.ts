import { describe, expect, it } from 'vitest';
import { canShowPostCompleteReviewForm, jobHasSubmittedReview } from './jobReviewStatus';

describe('job review status helpers', () => {
  it('detects submitted review from jobReview or userRating', () => {
    expect(jobHasSubmittedReview({ userRating: 5 })).toBe(true);
    expect(jobHasSubmittedReview({ jobReview: { rating: 4 } })).toBe(true);
    expect(jobHasSubmittedReview({})).toBe(false);
  });

  it('only shows form when completed, fully paid, and no review', () => {
    expect(
      canShowPostCompleteReviewForm({
        status: 'COMPLETED',
        paymentProgress: 'FULLY_PAID',
        paymentSummary: { label: 'FULLY_PAID' },
      })
    ).toBe(true);
    expect(
      canShowPostCompleteReviewForm({
        status: 'COMPLETED',
        paymentProgress: 'FIRST_PAID',
        paymentSummary: { label: 'COMPLETION_DUE' },
      })
    ).toBe(false);
    expect(
      canShowPostCompleteReviewForm({
        status: 'COMPLETED',
        paymentProgress: 'FULLY_PAID',
        userRating: 5,
      })
    ).toBe(false);
    expect(
      canShowPostCompleteReviewForm({
        status: 'IN_PROGRESS',
        paymentProgress: 'FULLY_PAID',
      })
    ).toBe(false);
  });
});
