import { MaterialOrder, OrderDelivery } from '@/types';
import type { OrderCardViewModel } from '@/components/orders/OrderCard';
import apiClient from '@/api/client';

interface OrdersResponse<T> {
  success: boolean;
  orders: T[];
}

interface OrderResponse {
  success: boolean;
  order: MaterialOrder | null;
}

export async function getMaterialOrders(userId: string): Promise<MaterialOrder[]> {
  const { data } = await apiClient.get<OrdersResponse<MaterialOrder>>('/material-orders', {
    params: { userId },
  });
  return Array.isArray(data?.orders) ? data.orders : [];
}

/**
 * Returns all material orders for a user: standalone orders + job-attached store orders.
 * Merged and sorted by createdAt descending. Used by Material Orders tab.
 */
export async function getAllMaterialOrdersForUser(userId: string): Promise<OrderCardViewModel[]> {
  const { data } = await apiClient.get<OrdersResponse<OrderCardViewModel>>('/material-orders/all', {
    params: { userId },
  });
  return Array.isArray(data?.orders) ? data.orders : [];
}

export async function getMaterialOrderById(orderId: string): Promise<MaterialOrder | null> {
  const { data } = await apiClient.get<OrderResponse>(`/material-orders/${orderId}`);
  return data?.order ?? null;
}

export async function createMaterialOrder(params: {
  userId: string;
  storeId: string;
  branchId?: string;
  storeName: string;
  items: MaterialOrder['items'];
  delivery: {
    type: 'SELF' | 'STORE' | 'PROVIDER';
    status: 'SelfCollect' | 'PendingApproval';
    providerId?: string;
    fee: number;
    address?: string;
    city?: string;
    area?: string;
    suburb?: string;
    coordinates?: { lat: number; lng: number };
  };
  materialsTotal: number;
  cardLast4?: string;
  paymentStatus?: 'unpaid' | 'paid';
  paymentIntentId?: string;
  customerLocation?: {
    address: string;
    city?: string;
    area?: string;
    suburb?: string;
    coordinates?: { lat: number; lng: number };
  };
}): Promise<MaterialOrder> {
  const { data } = await apiClient.post<OrderResponse>('/material-orders', {
    ...params,
    branchId: params.branchId ?? params.storeId,
  });
  if (!data?.order) throw new Error('Failed to create material order');
  return data.order;
}

export async function cancelMaterialOrder(
  orderId: string,
  reason?: string
): Promise<{
  order: MaterialOrder;
  refund: { amount: number; status: string; processedAt?: string };
}> {
  const { data } = await apiClient.post<{
    success: boolean;
    order: MaterialOrder | null;
    refund: { amount: number; status: string; processedAt?: string };
  }>(`/material-orders/${orderId}/cancel`, { reason });
  if (!data?.order) throw new Error('Cancel order failed');
  return { order: data.order, refund: data.refund };
}

export async function updateMaterialOrderDelivery(
  orderId: string,
  updates: Partial<OrderDelivery>
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery`, updates);
  return data?.order ?? null;
}

export async function approveMaterialOrderDelivery(orderId: string): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/approve`);
  return data?.order ?? null;
}

export async function rejectMaterialOrderDelivery(orderId: string): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/reject`);
  return data?.order ?? null;
}

export async function payMaterialOrderDelivery(
  orderId: string,
  cardLast4: string,
  fee: number
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.post<OrderResponse>(`/material-orders/${orderId}/delivery/pay`, {
    cardLast4,
    fee,
  });
  return data?.order ?? null;
}

export async function updateMaterialOrderDeliveryStatus(
  orderId: string,
  status: MaterialOrder['deliveryStatus']
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/status`, {
    status,
  });
  return data?.order ?? null;
}

export type ProviderFulfillmentStatus = 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'FAILED' | 'DELAYED';

export async function patchProviderMaterialOrderFulfillment(
  orderId: string,
  status: ProviderFulfillmentStatus
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/provider-fulfillment`, {
    status,
  });
  return data?.order ?? null;
}

/** Customer confirms pickup (READY→COMPLETED) or delivery receipt after COMPLETED. */
export async function confirmMaterialOrderCollection(orderId: string): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/confirm-collection`, {});
  return data?.order ?? null;
}

export async function acceptMaterialOrderDeliveryQuote(orderId: string): Promise<MaterialOrder | null> {
  const { data } = await apiClient.patch<OrderResponse>(`/material-orders/${orderId}/delivery/accept-quote`);
  return data?.order ?? null;
}

/** @deprecated Use confirmMaterialOrderCollection — same backend, legacy path. */
export async function confirmMaterialOrderDeliveryReceipt(orderId: string): Promise<MaterialOrder | null> {
  return confirmMaterialOrderCollection(orderId);
}

export type MaterialOrderDeliveryIssueReason =
  | 'items_missing'
  | 'items_broken'
  | 'wrong_items'
  | 'not_received'
  | 'other';

export async function reportMaterialOrderDeliveryIssue(
  orderId: string,
  params: { reason: MaterialOrderDeliveryIssueReason; details?: string }
): Promise<MaterialOrder | null> {
  const { data } = await apiClient.post<OrderResponse>(
    `/material-orders/${orderId}/report-delivery-issue`,
    params
  );
  return data?.order ?? null;
}
