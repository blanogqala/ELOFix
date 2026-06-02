import apiClient from '@/api/client';
import type { DeliveryGeoPoint, DeliveryRequestItem, DeliveryRequestRecord } from '@/types';

interface ListResponse {
  success: boolean;
  requests: DeliveryRequestRecord[];
}

interface OneResponse {
  success: boolean;
  request: DeliveryRequestRecord | null;
}

export async function getCourierDirectDeliveryInbox(): Promise<DeliveryRequestRecord[]> {
  const { data } = await apiClient.get<ListResponse>('/delivery-requests/delivery-inbox');
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function createDeliveryRequest(params: {
  category: string;
  description?: string;
  photos?: string[];
  items: DeliveryRequestItem[];
  collectionPoint: DeliveryGeoPoint;
  destinationPoint: DeliveryGeoPoint;
  courierId: string;
  jobId?: string;
}): Promise<DeliveryRequestRecord> {
  const { data } = await apiClient.post<OneResponse>('/delivery-requests', params);
  if (!data?.request) throw new Error('Failed to create delivery request');
  return data.request;
}

export async function getMyDeliveryRequests(): Promise<DeliveryRequestRecord[]> {
  const { data } = await apiClient.get<ListResponse>('/delivery-requests');
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function getDeliveryRequestById(id: string): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.get<OneResponse>(`/delivery-requests/${id}`);
  return data?.request ?? null;
}

export async function getDeliveryRequestByJobId(jobId: string): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.get<OneResponse>(`/delivery-requests/by-job/${jobId}`);
  return data?.request ?? null;
}

export async function acceptDeliveryRequestQuote(id: string): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.patch<OneResponse>(`/delivery-requests/${id}/accept-quote`);
  return data?.request ?? null;
}

export async function payDeliveryRequest(id: string, fee: number): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.post<OneResponse>(`/delivery-requests/${id}/pay`, { fee });
  return data?.request ?? null;
}

export async function submitDirectDeliveryQuote(
  id: string,
  params: { fee: number; note?: string }
): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.patch<OneResponse>(`/delivery-requests/${id}/quote`, params);
  return data?.request ?? null;
}

export async function rejectDirectDeliveryRequest(
  id: string,
  reason?: string
): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.patch<OneResponse>(`/delivery-requests/${id}/reject`, { reason });
  return data?.request ?? null;
}

export type CourierFulfillmentStatus =
  | 'COLLECTING'
  | 'COLLECTED'
  | 'OUT_FOR_DELIVERY'
  | 'AT_DESTINATION'
  | 'COMPLETED'
  | 'FAILED'
  | 'DELAYED';

export async function patchDirectDeliveryFulfillment(
  id: string,
  status: CourierFulfillmentStatus
): Promise<DeliveryRequestRecord | null> {
  const { data } = await apiClient.patch<OneResponse>(`/delivery-requests/${id}/fulfillment`, { status });
  return data?.request ?? null;
}
