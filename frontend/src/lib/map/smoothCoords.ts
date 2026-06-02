import { useEffect, useRef, useState } from 'react';

const DEFAULT_MS = 600;

/** Ease driver pin between GPS updates (Uber-style glide). */
export function useSmoothedLatLng(
  lat: number | null | undefined,
  lng: number | null | undefined,
  durationMs = DEFAULT_MS
): { lat: number | null; lng: number | null } {
  const [out, setOut] = useState<{ lat: number | null; lng: number | null }>({
    lat: lat ?? null,
    lng: lng ?? null,
  });
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setOut({ lat: null, lng: null });
      fromRef.current = null;
      return;
    }

    const target = { lat, lng };
    const start = fromRef.current ?? target;
    fromRef.current = target;

    if (start.lat === target.lat && start.lng === target.lng) {
      setOut(target);
      return;
    }

    const t0 = performance.now();
    const cancel = () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const ease = 1 - (1 - t) ** 3;
      setOut({
        lat: start.lat + (target.lat - start.lat) * ease,
        lng: start.lng + (target.lng - start.lng) * ease,
      });
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    cancel();
    frameRef.current = requestAnimationFrame(tick);
    return cancel;
  }, [lat, lng, durationMs]);

  return out;
}
