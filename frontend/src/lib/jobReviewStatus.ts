/** Pure helpers for list/detail review status. */

export function jobHasSubmittedReview(job: {
  userRating?: number | null;
  jobReview?: { rating?: number } | null;
}): boolean {
  if (job.jobReview?.rating != null && Number(job.jobReview.rating) > 0) return true;
  return job.userRating != null && Number(job.userRating) > 0;
}

export function canShowPostCompleteReviewForm(job: {
  status?: string;
  legacyEscrowV2?: boolean;
  paymentProgress?: string | null;
  paymentSummary?: { label?: string } | null;
  userRating?: number | null;
  jobReview?: { rating?: number } | null;
}): boolean {
  if (String(job.status || '').toUpperCase() !== 'COMPLETED') return false;
  if (jobHasSubmittedReview(job)) return false;
  if (job.legacyEscrowV2) return true;
  const label = String(job.paymentSummary?.label || '');
  const progress = String(job.paymentProgress || '');
  return label === 'FULLY_PAID' || progress === 'FULLY_PAID';
}
