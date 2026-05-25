import apiClient from '@/api/client';
import type { ProviderRatingBreakdown, ProviderReview } from '@/types';

export interface ProviderReviewsResponse {
  success: boolean;
  reviews: ProviderReview[];
  total: number;
  limit: number;
  offset: number;
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: ProviderRatingBreakdown;
  completedJobs: number;
}

export async function getProviderReviews(
  providerId: string,
  params?: { limit?: number; offset?: number }
): Promise<ProviderReviewsResponse> {
  const { data } = await apiClient.get<ProviderReviewsResponse>(`/providers/${providerId}/reviews`, {
    params,
  });
  return data;
}

export async function submitProviderReview(payload: {
  jobId: string;
  rating: number;
  comment?: string;
}): Promise<ProviderReview> {
  const { data } = await apiClient.post<{ success: boolean; review: ProviderReview }>(
    '/provider-reviews',
    payload
  );
  if (!data?.review) throw new Error('Failed to submit review');
  return data.review;
}
