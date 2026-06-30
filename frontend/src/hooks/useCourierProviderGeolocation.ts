import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';
import { getCurrentSession } from '@/lib/api/auth';
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
      const session = getCurrentSession();
      if (session?.token) socket.auth = { token: session.token };
      if (!socket.connected) socket.connect();
    }

    const sendState = createLocationSendState();
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        setLat(nextLat);
        setLng(nextLng);
        setGeoError(null);

        if (deliveryRequestId && shouldSendLocation(now, nextLat, nextLng, sendState)) {
          markLocationSent(now, nextLat, nextLng, sendState);
          socket.emit('update_location', { orderId: deliveryRequestId, lat: nextLat, lng: nextLng });
        }
      },
      () => {
        setGeoError('Allow location access to share live position with the customer.');
      },
      { enableHighAccuracy: true, maximumAge: 8000 }
    );

    return () => navigator.geolocation.clearWatch(wid);
  }, [enabled, deliveryRequestId]);

  return { lat, lng, geoError };
}
