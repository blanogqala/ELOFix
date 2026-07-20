import { useCallback, useEffect, useRef, useState } from 'react';
import { forwardGeocode as forwardGeocodeApi } from '@/lib/api/geocode';

export type GeocodedPoint = { lat: number; lng: number };

const CACHE_PREFIX = 'elofix:geocode:';
const CACHE_TTL_MS = 10 * 60 * 1000;

function readCache(key: string): GeocodedPoint | null {
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number; expiresAt: number };
    if (Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

function writeCache(key: string, point: GeocodedPoint) {
  try {
    sessionStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ ...point, expiresAt: Date.now() + CACHE_TTL_MS })
    );
  } catch {
    /* ignore quota */
  }
}

export function useGeocoder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const forward = useCallback(async (address: string): Promise<GeocodedPoint | null> => {
    const q = address.trim();
    if (!q) return null;

    const cacheKey = q.toLowerCase();
    const cached = readCache(cacheKey);
    if (cached) return cached;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await forwardGeocodeApi(q);
      const point = { lat: result.lat, lng: result.lng };
      writeCache(cacheKey, point);
      return point;
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Geocoding failed');
      }
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { forward, loading, error };
}

export function useForwardGeocode(address: string | undefined, enabled: boolean) {
  const { forward, loading, error } = useGeocoder();
  const [point, setPoint] = useState<GeocodedPoint | null>(null);

  useEffect(() => {
    if (!enabled || !address?.trim()) {
      setPoint(null);
      return;
    }
    let cancelled = false;
    void forward(address).then((p) => {
      if (!cancelled) setPoint(p);
    });
    return () => {
      cancelled = true;
    };
  }, [address, enabled, forward]);

  return { point, loading, error };
}
