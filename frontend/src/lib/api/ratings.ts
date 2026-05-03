import apiClient from '@/api/client';

export async function submitMaterialOrderRating(payload: {
  orderId: string;
  rating: number;
  comment?: string;
}): Promise<void> {
  await apiClient.post<{ success: boolean }>('/ratings', {
    orderId: payload.orderId,
    rating: payload.rating,
    comment: payload.comment,
  });
}
