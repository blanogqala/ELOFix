import { useEffect, useMemo, useRef, useState, memo } from 'react';
import type maplibregl from 'maplibre-gl';
import { cn } from '@/lib/utils';
import { haversineMeters } from '@/lib/geolocationSendGate';
import { MapProvider, useMapLibre } from '@/components/maps/MapProvider';
import { MapView } from '@/components/maps/MapView';
import { MapMarker } from '@/components/maps/Marker';
import { RouteRenderer } from '@/components/maps/RouteRenderer';
import { MapControls } from '@/components/maps/MapControls';
import { MapSkeleton } from '@/components/maps/MapSkeleton';
import { MapErrorState } from '@/components/maps/MapErrorState';
import { useMap } from '@/hooks/maps/useMap';
import { useForwardGeocode } from '@/hooks/maps/useGeocoder';
import { useRoute } from '@/hooks/maps/useRoute';
import { bearingBetween, type DestinationPinKind } from '@/lib/map/mapMarkerIcons';
import { useSmoothedLatLng } from '@/lib/map/smoothCoords';
import { MAP_DEFAULT_CENTER, MAP_DRIVER_ZOOM } from '@/lib/map/mapStyles';

const DRIVER_NEAR_METERS = 500;
const DRIVER_ARRIVING_METERS = 120;

export type DeliveryRoutePhase =
  | 'to_collection'
  | 'at_collection'
  | 'to_destination'
  | 'at_destination';

function routePhaseSubtitle(phase: DeliveryRoutePhase): string {
  switch (phase) {
    case 'to_collection':
      return 'Heading to collect at:';
    case 'at_collection':
      return 'Items collected at:';
    case 'at_destination':
      return 'Arrived at:';
    case 'to_destination':
    default:
      return 'Delivering to:';
  }
}

export type DriverProximityPayload = {
  near: boolean;
  arriving: boolean;
  distanceMeters: number | null;
};

export interface DeliveryMapProps {
  lat?: number | null;
  lng?: number | null;
  destination?: string;
  destinationCoords?: { lat: number; lng: number } | null;
  routePhase?: DeliveryRoutePhase;
  className?: string;
  mapContainerClassName?: string;
  showWaitingBanner?: boolean;
  trackingEnded?: boolean;
  completedMode?: boolean;
  onProximityChange?: (v: DriverProximityPayload) => void;
  onEtaChange?: (etaText: string | null) => void;
}

function MapBody({
  lat,
  lng,
  destination,
  destinationCoords,
  routePhase = 'to_destination',
  className,
  mapContainerClassName = 'h-64 w-full min-h-[220px]',
  showWaitingBanner,
  trackingEnded,
  onProximityChange,
  onEtaChange,
}: Omit<DeliveryMapProps, 'className'> & { className?: string }) {
  const prevDriverRef = useRef<{ lat: number; lng: number } | null>(null);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const proximityRef = useRef({ near: false, arriving: false, distanceMeters: null as number | null });
  const onProximityChangeRef = useRef(onProximityChange);
  onProximityChangeRef.current = onProximityChange;
  const onEtaChangeRef = useRef(onEtaChange);
  onEtaChangeRef.current = onEtaChange;

  const { isLoaded, loadError } = useMapLibre();
  const { mapRef, fitBounds, fitPoints, setCenter } = useMap();

  const rawDriverPos =
    lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : null;

  const smoothed = useSmoothedLatLng(rawDriverPos?.lat, rawDriverPos?.lng);
  const driverPos =
    smoothed.lat != null && smoothed.lng != null
      ? { lat: smoothed.lat, lng: smoothed.lng }
      : null;

  const hasExplicitDest =
    destinationCoords &&
    Number.isFinite(destinationCoords.lat) &&
    Number.isFinite(destinationCoords.lng);

  const { point: geocodedDest, loading: geocoding, error: geocodeError } = useForwardGeocode(
    destination,
    Boolean(destination?.trim()) && !hasExplicitDest
  );

  const destForRoute = useMemo(() => {
    if (hasExplicitDest) {
      return { lat: Number(destinationCoords!.lat), lng: Number(destinationCoords!.lng) };
    }
    if (geocodedDest) return geocodedDest;
    return null;
  }, [hasExplicitDest, destinationCoords, geocodedDest]);

  const pinKind: DestinationPinKind =
    routePhase === 'to_collection' || routePhase === 'at_collection' ? 'collection' : 'delivery';

  const { route, etaText } = useRoute(rawDriverPos, destForRoute);

  useEffect(() => {
    onEtaChangeRef.current?.(etaText);
  }, [etaText]);

  useEffect(() => {
    if (!rawDriverPos) {
      prevDriverRef.current = null;
      return;
    }
    const prev = prevDriverRef.current;
    if (prev) {
      const moved =
        Math.abs(prev.lat - rawDriverPos.lat) > 0.00001 || Math.abs(prev.lng - rawDriverPos.lng) > 0.00001;
      if (moved) {
        setHeadingDeg(bearingBetween(prev.lat, prev.lng, rawDriverPos.lat, rawDriverPos.lng));
      }
    } else if (destForRoute) {
      setHeadingDeg(bearingBetween(rawDriverPos.lat, rawDriverPos.lng, destForRoute.lat, destForRoute.lng));
    }
    prevDriverRef.current = rawDriverPos;
  }, [rawDriverPos?.lat, rawDriverPos?.lng, destForRoute?.lat, destForRoute?.lng]);

  const center = useMemo(() => {
    if (driverPos) return driverPos;
    if (destForRoute) return destForRoute;
    return MAP_DEFAULT_CENTER;
  }, [driverPos, destForRoute]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (route?.bounds) {
      fitBounds(route.bounds);
      return;
    }
    const points = [driverPos, destForRoute].filter(Boolean) as { lat: number; lng: number }[];
    if (points.length > 0) {
      fitPoints(points);
    } else if (destForRoute) {
      setCenter(destForRoute, MAP_DRIVER_ZOOM);
    }
  }, [mapReady, route, driverPos, destForRoute, fitBounds, fitPoints, setCenter, mapRef]);

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
      <MapErrorState
        className={className}
        message="Could not load the map library. Check your network connection and try again."
        lastPosition={driverPos}
      />
    );
  }

  if (!isLoaded) {
    return <MapSkeleton className={className} />;
  }

  const hasDestinationHint = Boolean(destination?.trim() || destinationCoords);
  const showMapSurface = Boolean(driverPos || destForRoute || hasDestinationHint);

  if (!showMapSurface) {
    return (
      <div className={cn('overflow-hidden rounded-lg border border-border bg-muted/20', className)}>
        {trackingEnded ? (
          <p className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">Tracking session ended</p>
        ) : null}
        <div className="p-6 text-sm text-muted-foreground">
          <p>Add a delivery address to preview the route.</p>
        </div>
      </div>
    );
  }

  const mapInstance = mapRef.current;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border', className)}>
      {trackingEnded ? (
        <p className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Tracking session ended
        </p>
      ) : null}
      {showWaitingBanner && !driverPos ? (
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {geocoding
            ? 'Loading route destination…'
            : geocodeError && !destForRoute
              ? 'Could not locate the address on the map — waiting for driver location…'
              : destForRoute
                ? 'Waiting for driver location…'
                : 'Waiting for driver location and a routable destination…'}
        </p>
      ) : null}
      {destination ? (
        <p className="border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{routePhaseSubtitle(routePhase)}</span> {destination}
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
      <div className={cn('relative elofix-map-surface', mapContainerClassName)}>
        <MapView
          className="h-full w-full"
          center={center}
          zoom={driverPos ? MAP_DRIVER_ZOOM : 12}
          mapRef={mapRef}
          onMapReady={() => setMapReady(true)}
        />
        {mapReady && mapInstance ? (
          <>
            <RouteRenderer map={mapInstance} geometry={route?.geometry ?? null} />
            <MapMarker map={mapInstance} position={driverPos} kind="vehicle" headingDeg={headingDeg} />
            <MapMarker map={mapInstance} position={destForRoute} kind="destination" pinKind={pinKind} />
            <MapControls map={mapInstance} focusPoint={driverPos ?? destForRoute} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DeliveryMapWithProvider(props: DeliveryMapProps) {
  return (
    <MapProvider>
      <MapBody {...props} />
    </MapProvider>
  );
}

export const DeliveryMap = memo(DeliveryMapWithProvider);
