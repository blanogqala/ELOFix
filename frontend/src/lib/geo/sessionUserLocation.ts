const KEY = 'elofix_user_geo_v1';

export type CachedUserCoords = { lat: number; lng: number; savedAt: number };

export function readCachedUserCoords(): CachedUserCoords | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CachedUserCoords>;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const savedAt = Number(p.savedAt);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(savedAt)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng, savedAt };
  } catch {
    return null;
  }
}

export function writeCachedUserCoords(lat: number, lng: number): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ lat, lng, savedAt: Date.now() }));
  } catch {
    /* quota / privacy mode */
  }
}
