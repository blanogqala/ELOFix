import apiClient, { ApiHttpError } from '@/api/client';

export interface PublicTrackingMeta {
  orderId: string;
  fulfillmentStatus: string;
  destinationLabel: string;
  isActive: boolean;
  lastLocation: { lat: number; lng: number } | null;
  expiresAt?: string;
}

export interface LatestTrackingPayload {
  lastLat: number | null;
  lastLng: number | null;
  lastPingAt: string | null;
}

export async function getPublicTracking(trackingId: string, token?: string | null): Promise<PublicTrackingMeta> {
  const { data } = await apiClient.get<PublicTrackingMeta & { success?: boolean }>(
    `/tracking/${encodeURIComponent(trackingId)}`,
    token ? { params: { token } } : undefined
  );
  const {
    orderId,
    fulfillmentStatus,
    destinationLabel,
    isActive,
    lastLocation,
    expiresAt,
  } = data as PublicTrackingMeta;
  return { orderId, fulfillmentStatus, destinationLabel, isActive, lastLocation, expiresAt };
}

export async function postTrackingLocation(
  trackingId: string,
  lat: number,
  lng: number,
  token?: string | null
): Promise<void> {
  await apiClient.post('/tracking/update', {
    trackingId,
    lat,
    lng,
    ...(token ? { token } : {}),
  });
}

export async function getLatestTrackingForOrder(orderId: string): Promise<LatestTrackingPayload> {
  const { data } = await apiClient.get<LatestTrackingPayload & { success?: boolean }>(
    `/tracking/latest/${encodeURIComponent(orderId)}`
  );
  const d = data as LatestTrackingPayload & { success?: boolean };
  return {
    lastLat: d.lastLat != null ? Number(d.lastLat) : null,
    lastLng: d.lastLng != null ? Number(d.lastLng) : null,
    lastPingAt: d.lastPingAt ?? null,
  };
}

export function isTrackingGoneError(e: unknown): boolean {
  if (!(e instanceof ApiHttpError)) return false;
  return e.status === 410 || e.status === 404;
}
