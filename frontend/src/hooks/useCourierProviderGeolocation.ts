import { useEffect, useState } from 'react';
import { ensureSocketAuthAndConnect, socket } from '@/lib/socket';
import { createLocationSendState, markLocationSent, shouldSendLocation } from '@/lib/geolocationSendGate';

export const COURIER_LIVE_GPS_STATUSES = new Set([
  'COLLECTING',
  'COLLECTED',
  'OUT_FOR_DELIVERY',
  'AT_DESTINATION',
]);

interface UseCourierProviderGeolocationOpts {
  enabled: boolean;
  deliveryRequestId?: string;
}

function emitDriverLocation(deliveryRequestId: string, lat: number, lng: number) {
  ensureSocketAuthAndConnect();
  if (!socket.connected) {
    socket.once('connect', () => {
      socket.emit('update_location', { orderId: deliveryRequestId, lat, lng });
    });
    return;
  }
  socket.emit('update_location', { orderId: deliveryRequestId, lat, lng });
}

export function useCourierProviderGeolocation({
  enabled,
  deliveryRequestId,
}: UseCourierProviderGeolocationOpts) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLat(null);
      setLng(null);
      setGeoError(null);
      return;
    }

    if (!navigator.geolocation) {
      setGeoError('Enable location in your browser so the customer can follow your trip.');
      return;
    }

    if (deliveryRequestId) {
      ensureSocketAuthAndConnect();
    }

    const sendState = createLocationSendState();
    let cancelled = false;

    const publish = (nextLat: number, nextLng: number, force: boolean) => {
      if (cancelled) return;
      setLat(nextLat);
      setLng(nextLng);
      setGeoError(null);
      if (!deliveryRequestId) return;
      const now = Date.now();
      if (!force && !shouldSendLocation(now, nextLat, nextLng, sendState)) return;
      markLocationSent(now, nextLat, nextLng, sendState);
      emitDriverLocation(deliveryRequestId, nextLat, nextLng);
    };

    // Immediate fix: seed last-known ASAP so the customer map is not stuck on
    // "Waiting for driver location…" until the first watchPosition tick.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        publish(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => {
        if (!cancelled) {
          setGeoError('Allow location access to share live position with the customer.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 }
    );

    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        publish(pos.coords.latitude, pos.coords.longitude, false);
      },
      () => {
        if (!cancelled) {
          setGeoError('Allow location access to share live position with the customer.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 8000 }
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(wid);
    };
  }, [enabled, deliveryRequestId]);

  return { lat, lng, geoError };
}
