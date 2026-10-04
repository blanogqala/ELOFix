/** Customer-facing stale window. Matches the existing 30s live-tracking threshold. */
export const LIVE_LOCATION_STALE_MS = 30_000;

export const DRIVER_ARRIVING_METERS = 120;
export const DRIVER_NEAR_METERS = 500;

export type LiveTrackingHeadline = 'unavailable' | 'arriving' | 'near' | 'en_route';

export function pingMsFromServer(lastPingAt: string | null | undefined): number | null {
  if (!lastPingAt) return null;
  const t = new Date(lastPingAt).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * A poll of the same coordinate must keep the server timestamp.
 * Only a real movement or a socket publish may advance the heartbeat.
 */
export function nextLocationHeartbeatMs(input: {
  previousLat: number | null;
  previousLng: number | null;
  lat: number;
  lng: number;
  serverPingAt?: string | null;
  nowMs: number;
  fromSocket: boolean;
}): number | null {
  const serverMs = pingMsFromServer(input.serverPingAt);
  const hadPrevious = input.previousLat != null && input.previousLng != null;
  const moved =
    !hadPrevious ||
    input.previousLat !== input.lat ||
    input.previousLng !== input.lng;
  if (!moved && !input.fromSocket) {
    return serverMs;
  }
  if (input.fromSocket) return input.nowMs;
  return serverMs;
}

export function isLiveLocationStale(
  hasDriverFix: boolean,
  lastPingMs: number | null | undefined,
  nowMs: number,
  staleMs = LIVE_LOCATION_STALE_MS
): boolean {
  if (!hasDriverFix) return false;
  if (lastPingMs == null || !Number.isFinite(lastPingMs)) return true;
  return nowMs - lastPingMs > staleMs;
}

/** Missing, non-finite, or non-positive durations are not an ETA. */
export function usableEtaText(
  durationText: string | null | undefined,
  durationSeconds?: number | null
): string | null {
  if (durationSeconds != null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    return null;
  }
  const text = String(durationText || '').trim();
  if (!text) return null;
  if (/^0(\.0+)?\s*sec$/i.test(text)) return null;
  return text;
}

export function liveTrackingHeadline(input: {
  hasDriverFix: boolean;
  distanceMeters: number | null;
  lastPingMs: number | null | undefined;
  nowMs: number;
  mapSaysArriving?: boolean;
  mapSaysNear?: boolean;
}): LiveTrackingHeadline {
  if (
    isLiveLocationStale(input.hasDriverFix, input.lastPingMs, input.nowMs)
  ) {
    return 'unavailable';
  }
  const arriving =
    (input.distanceMeters != null && input.distanceMeters < DRIVER_ARRIVING_METERS) ||
    (input.distanceMeters == null && Boolean(input.mapSaysArriving));
  if (arriving) return 'arriving';
  const near =
    (input.distanceMeters != null && input.distanceMeters < DRIVER_NEAR_METERS) ||
    (input.distanceMeters == null && Boolean(input.mapSaysNear));
  if (near) return 'near';
  return 'en_route';
}

export type StoreShareUiState = 'idle' | 'active' | 'denied' | 'unavailable' | 'expired' | 'network';

export function storeShareStatusText(state: StoreShareUiState): string | null {
  switch (state) {
    case 'active':
      return 'Sharing active';
    case 'denied':
      return 'Location permission denied. Allow location access to share the delivery position.';
    case 'unavailable':
      return 'GPS unavailable on this device.';
    case 'expired':
      return 'Tracking session expired. Start delivery tracking again.';
    case 'network':
      return 'Network failure. Location was not saved.';
    default:
      return null;
  }
}

export function storeShareStateFromGeolocationError(code: number | undefined): StoreShareUiState {
  if (code === 1) return 'denied';
  return 'unavailable';
}
