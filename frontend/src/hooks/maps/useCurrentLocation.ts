import { useCallback, useRef, useState } from 'react';

export type CurrentLocationResult = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type UseCurrentLocationOptions = {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAgeMs?: number;
  maxRetries?: number;
};

export function useCurrentLocation(options: UseCurrentLocationOptions = {}) {
  const {
    enableHighAccuracy = true,
    timeoutMs = 15000,
    maximumAgeMs = 8000,
    maxRetries = 2,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<CurrentLocationResult | null>(null);
  const retriesRef = useRef(0);

  const request = useCallback(async (): Promise<CurrentLocationResult | null> => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      return null;
    }

    setLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          retriesRef.current = 0;
          const result = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setPosition(result);
          setLoading(false);
          resolve(result);
        },
        (err) => {
          if (retriesRef.current < maxRetries) {
            retriesRef.current += 1;
            setTimeout(() => {
              void request().then(resolve);
            }, 800);
            return;
          }
          const msg =
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied.'
              : err.code === err.TIMEOUT
                ? 'Location request timed out.'
                : 'Unable to get current location.';
          setError(msg);
          setLoading(false);
          resolve(null);
        },
        { enableHighAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs }
      );
    });
  }, [enableHighAccuracy, timeoutMs, maximumAgeMs, maxRetries]);

  return { position, loading, error, request };
}
