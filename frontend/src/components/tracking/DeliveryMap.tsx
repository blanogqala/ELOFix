import { GoogleMap, Marker, useJsApiLoader, DirectionsRenderer } from '@react-google-maps/api';
import { useEffect, useMemo, useRef, useState, memo } from 'react';
import { cn } from '@/lib/utils';
import { haversineMeters } from '@/lib/geolocationSendGate';

const DRIVER_NEAR_METERS = 500;
const DRIVER_ARRIVING_METERS = 120;

export type DriverProximityPayload = {
  near: boolean;
  arriving: boolean;
  distanceMeters: number | null;
};

const defaultCenter = { lat: -26.2, lng: 28.05 };

export interface DeliveryMapProps {
  lat?: number | null;
  lng?: number | null;
  destination?: string;
  destinationCoords?: { lat: number; lng: number } | null;
  className?: string;
  /** Live map expected but driver position not yet available */
  showWaitingBanner?: boolean;
  /** Session no longer valid (customer view) */
  trackingEnded?: boolean;
  onProximityChange?: (v: DriverProximityPayload) => void;
  onEtaChange?: (etaText: string | null) => void;
}

function MapBody({
  lat,
  lng,
  destination,
  destinationCoords,
  className,
  showWaitingBanner,
  trackingEnded,
  onProximityChange,
  onEtaChange,
}: Omit<DeliveryMapProps, 'className'> & { className?: string }) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const proximityRef = useRef({ near: false, arriving: false, distanceMeters: null as number | null });
  const onProximityChangeRef = useRef(onProximityChange);
  onProximityChangeRef.current = onProximityChange;
  const onEtaChangeRef = useRef(onEtaChange);
  onEtaChangeRef.current = onEtaChange;

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: String(import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || ''),
    id: 'elofix-google-maps',
  });

  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [geocodedDest, setGeocodedDest] = useState<google.maps.LatLngLiteral | null>(null);
  const [etaText, setEtaText] = useState<string | null>(null);

  const driverPos =
    lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : null;

  const destForRoute = useMemo(() => {
    if (destinationCoords && Number.isFinite(destinationCoords.lat) && Number.isFinite(destinationCoords.lng)) {
      return { lat: Number(destinationCoords.lat), lng: Number(destinationCoords.lng) };
    }
    if (geocodedDest) return geocodedDest;
    return null;
  }, [destinationCoords, geocodedDest]);

  const center = useMemo(() => {
    if (driverPos) return driverPos;
    if (destForRoute) return destForRoute;
    return defaultCenter;
  }, [driverPos, destForRoute]);

  useEffect(() => {
    if (!isLoaded || !window.google?.maps) return;
    const addr = destination?.trim();
    if (!addr || destinationCoords) {
      setGeocodedDest(null);
      return;
    }
    const geo = new google.maps.Geocoder();
    geo.geocode({ address: addr }, (results, status) => {
      if (status === 'OK' && results?.[0]?.geometry?.location) {
        setGeocodedDest(results[0].geometry.location.toJSON());
      } else {
        setGeocodedDest(null);
      }
    });
  }, [isLoaded, destination, destinationCoords]);

  useEffect(() => {
    if (!isLoaded || !driverPos || !destForRoute) {
      setDirections(null);
      setEtaText(null);
      onEtaChangeRef.current?.(null);
      return;
    }
    const svc = new google.maps.DirectionsService();
    svc.route(
      {
        origin: driverPos,
        destination: destForRoute,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setDirections(result);
          const leg = result.routes[0]?.legs[0];
          const eta = leg?.duration?.text ?? null;
          setEtaText(eta);
          onEtaChangeRef.current?.(eta);
        } else {
          setDirections(null);
          setEtaText(null);
          onEtaChangeRef.current?.(null);
        }
      }
    );
  }, [isLoaded, driverPos, destForRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google?.maps) return;
    if (directions?.routes?.[0]?.bounds) {
      map.fitBounds(directions.routes[0].bounds, 48);
      return;
    }
    if (driverPos && destForRoute) {
      const b = new google.maps.LatLngBounds();
      b.extend(driverPos);
      b.extend(destForRoute);
      map.fitBounds(b, 48);
    } else if (driverPos) {
      map.setCenter(driverPos);
      map.setZoom(14);
    } else if (destForRoute) {
      map.setCenter(destForRoute);
      map.setZoom(12);
    }
  }, [directions, driverPos, destForRoute]);

  useEffect(() => {
    if (!driverPos || !destForRoute) {
      const prev = proximityRef.current;
      if (prev.near || prev.arriving || prev.distanceMeters != null) {
        proximityRef.current = { near: false, arriving: false, distanceMeters: null };
        onProximityChangeRef.current?.({ near: false, arriving: false, distanceMeters: null });
      }
      return;
    }
    const d = haversineMeters(driverPos.lat, driverPos.lng, destForRoute.lat, destForRoute.lng);
    const near = d < DRIVER_NEAR_METERS;
    const arriving = d < DRIVER_ARRIVING_METERS;
    const prev = proximityRef.current;
    if (
      near !== prev.near ||
      arriving !== prev.arriving ||
      prev.distanceMeters == null ||
      Math.abs(prev.distanceMeters - d) > 5
    ) {
      proximityRef.current = { near, arriving, distanceMeters: d };
      onProximityChangeRef.current?.({ near, arriving, distanceMeters: d });
    }
  }, [driverPos, destForRoute]);

  const nearBanner =
    driverPos &&
    destForRoute &&
    haversineMeters(driverPos.lat, driverPos.lng, destForRoute.lat, destForRoute.lng) < DRIVER_NEAR_METERS;
  const arrivingBanner =
    driverPos &&
    destForRoute &&
    haversineMeters(driverPos.lat, driverPos.lng, destForRoute.lat, destForRoute.lng) < DRIVER_ARRIVING_METERS;

  if (loadError) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground',
          className
        )}
      >
        <p className="font-medium text-foreground">Live map</p>
        <p className="mt-1">Could not load Google Maps.</p>
        {driverPos && (
          <p className="mt-2 text-xs tabular-nums">
            Last position: {driverPos.lat.toFixed(5)}, {driverPos.lng.toFixed(5)}
          </p>
        )}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={cn('rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground', className)}>
        Loading map…
      </div>
    );
  }

  if (!driverPos && !destForRoute) {
    return (
      <div className={cn('overflow-hidden rounded-lg border border-border bg-muted/20', className)}>
        {trackingEnded ? (
          <p className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">Tracking session ended</p>
        ) : null}
        {showWaitingBanner ? (
          <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Waiting for driver location and a routable destination…
          </p>
        ) : null}
        <div className="p-6 text-sm text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">Delivery map</p>
          <p>
            {destination
              ? 'Destination address is loaded; once the driver shares GPS, the route will appear here.'
              : 'Add a delivery address or enable maps API to preview the route.'}
          </p>
          {destination ? (
            <p className="text-xs border-t border-border pt-2">
              <span className="font-medium text-foreground">Address:</span> {destination}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border', className)}>
      {trackingEnded ? (
        <p className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Tracking session ended
        </p>
      ) : null}
      {showWaitingBanner && !driverPos ? (
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Waiting for driver location…
        </p>
      ) : null}
      {destination ? (
        <p className="border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Delivering to:</span> {destination}
        </p>
      ) : null}
      {arrivingBanner ? (
        <p className="border-b border-border bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary">
          Driver arriving
        </p>
      ) : nearBanner ? (
        <p className="border-b border-border bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          Driver is near
        </p>
      ) : null}
      {driverPos && destForRoute && etaText ? (
        <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium tabular-nums">
          ETA {etaText}
        </p>
      ) : null}
      <GoogleMap
        mapContainerClassName="h-64 w-full"
        center={center}
        zoom={driverPos ? 14 : 12}
        onLoad={(m) => {
          mapRef.current = m;
        }}
      >
        {directions ? (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: { strokeColor: '#2563eb', strokeOpacity: 0.92, strokeWeight: 4 },
            }}
          />
        ) : null}
        {driverPos ? <Marker position={driverPos} label="D" /> : null}
        {destForRoute ? <Marker position={destForRoute} label="B" /> : null}
      </GoogleMap>
    </div>
  );
}

function DeliveryMapComponent(props: DeliveryMapProps) {
  const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) || '';
  if (!apiKey || !String(apiKey).trim()) {
    const driverPos =
      props.lat != null &&
      props.lng != null &&
      Number.isFinite(Number(props.lat)) &&
      Number.isFinite(Number(props.lng))
        ? { lat: Number(props.lat), lng: Number(props.lng) }
        : null;
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground',
          props.className
        )}
      >
        <p className="font-medium text-foreground">Live map</p>
        {props.trackingEnded ? <p className="mt-1 text-destructive">Tracking session ended</p> : null}
        {props.showWaitingBanner && !driverPos ? (
          <p className="mt-1">Waiting for driver location…</p>
        ) : null}
        <p className="mt-1">
          {props.destination
            ? `Destination: ${props.destination}`
            : 'Add VITE_GOOGLE_MAPS_API_KEY to enable the map.'}
        </p>
        {driverPos && (
          <p className="mt-2 text-xs tabular-nums">
            Last position: {driverPos.lat.toFixed(5)}, {driverPos.lng.toFixed(5)}
          </p>
        )}
      </div>
    );
  }

  return <MapBody {...props} />;
}

export const DeliveryMap = memo(DeliveryMapComponent);
