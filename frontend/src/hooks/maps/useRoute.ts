import { useEffect, useRef, useState } from 'react';
import { fetchDirections, type RouteResponse } from '@/lib/map/routeApi';

const ROUTE_CACHE_PREFIX = 'elofix:route:';
const ROUTE_CACHE_TTL_MS = 2 * 60 * 1000;

function routeCacheKey(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number }
) {
  return `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
}

function readRouteCache(key: string): RouteResponse | null {
  try {
    const raw = sessionStorage.getItem(`${ROUTE_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RouteResponse & { expiresAt: number };
    if (Date.now() > parsed.expiresAt) {
      sessionStorage.removeItem(`${ROUTE_CACHE_PREFIX}${key}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeRouteCache(key: string, route: RouteResponse) {
  try {
    sessionStorage.setItem(
      `${ROUTE_CACHE_PREFIX}${key}`,
      JSON.stringify({ ...route, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS })
    );
  } catch {
    /* ignore */
  }
}

type LatLng = { lat: number; lng: number };

export function useRoute(origin: LatLng | null, destination: LatLng | null) {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null);
      setError(null);
      return;
    }

    const cacheKey = routeCacheKey(origin, destination);
    const cached = readRouteCache(cacheKey);
    if (cached) {
      setRoute(cached);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchDirections(origin, destination)
      .then((result) => {
        if (cancelled || controller.signal.aborted) return;
        writeRouteCache(cacheKey, result);
        setRoute(result);
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setRoute(null);
        const offline = typeof navigator !== 'undefined' && !navigator.onLine;
        setError(
          offline
            ? 'You appear to be offline. Route will refresh when connection returns.'
            : err instanceof Error
              ? err.message
              : 'Unable to load route'
        );
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  return {
    route,
    etaText: route?.durationText ?? null,
    loading,
    error,
  };
}
