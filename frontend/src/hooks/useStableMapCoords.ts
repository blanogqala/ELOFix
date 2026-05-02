import { useEffect, useRef, useState } from 'react';
import { haversineMeters } from '@/lib/geolocationSendGate';

const MIN_MOVE_M = 10;
const MIN_MS = 3000;

/** Throttles map-driving coords: require >10m movement and >3s since last output (first point immediate). */
export function useStableMapCoords(
  lat: number | null | undefined,
  lng: number | null | undefined
): { lat: number | null; lng: number | null } {
  const ref = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const [out, setOut] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });

  useEffect(() => {
    if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return;
    }
    const la = Number(lat);
    const lo = Number(lng);
    const now = Date.now();
    const prev = ref.current;
    if (!prev) {
      ref.current = { lat: la, lng: lo, t: now };
      setOut({ lat: la, lng: lo });
      return;
    }
    const dist = haversineMeters(prev.lat, prev.lng, la, lo);
    const cooled = now - prev.t >= MIN_MS;
    if ((dist >= MIN_MOVE_M && cooled) || dist >= 200) {
      ref.current = { lat: la, lng: lo, t: now };
      setOut({ lat: la, lng: lo });
    }
  }, [lat, lng]);

  return out;
}
