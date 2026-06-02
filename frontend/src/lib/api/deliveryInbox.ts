import { MaterialOrder } from '@/types';
import apiClient from '@/api/client';

interface OrdersResponse {
  success: boolean;
  orders: MaterialOrder[];
}

interface OrderResponse {
  success: boolean;
  order: MaterialOrder | null;
}

export async function getCourierDeliveryInbox(): Promise<MaterialOrder[]> {
  const { data } = await apiClient.get<OrdersResponse>('/material-orders/delivery-inbox');
  return Array.isArray(data?.orders) ? data.orders : [];
}

export async function submitCourierDeliveryQuote(
  orderId: string,
  params: { fee: number; note?: string }
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/quote`, params);
  return data?.order ?? null;
}

export async function rejectCourierDeliveryRequest(
  orderId: string,
  reason?: string
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/reject-request`, {
    reason,
  });
  return data?.order ?? null;
}

export async function acceptMaterialOrderDeliveryQuote(orderId: string): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/accept-quote`);
  return data?.order ?? null;
}
