/** Throttle and minimum movement for driver location uploads (matches product spec). */
export const LOCATION_SEND_THROTTLE_MS = 5000;
export const LOCATION_MIN_MOVE_METERS = 10;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true when the position should be uploaded (time + distance vs last accepted send).
 */
export function shouldSendLocation(
  nowMs: number,
  lat: number,
  lng: number,
  state: { lastSentAt: number; lastSentLat: number | null; lastSentLng: number | null }
): boolean {
  if (nowMs - state.lastSentAt < LOCATION_SEND_THROTTLE_MS) return false;
  if (
    state.lastSentLat != null &&
    state.lastSentLng != null &&
    Number.isFinite(state.lastSentLat) &&
    Number.isFinite(state.lastSentLng)
  ) {
    if (haversineMeters(state.lastSentLat, state.lastSentLng, lat, lng) < LOCATION_MIN_MOVE_METERS) {
      return false;
    }
  }
  return true;
}

export function markLocationSent(
  nowMs: number,
  lat: number,
  lng: number,
  state: { lastSentAt: number; lastSentLat: number | null; lastSentLng: number | null }
): void {
  state.lastSentAt = nowMs;
  state.lastSentLat = lat;
  state.lastSentLng = lng;
}

export function createLocationSendState(): {
  lastSentAt: number;
  lastSentLat: number | null;
  lastSentLng: number | null;
} {
  return { lastSentAt: 0, lastSentLat: null, lastSentLng: null };
}
