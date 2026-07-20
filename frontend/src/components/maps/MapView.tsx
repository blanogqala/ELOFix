import { useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import { cn } from '@/lib/utils';
import { useMap, useMapInstance, type LatLng } from '@/hooks/maps/useMap';
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from '@/lib/map/mapStyles';

export type MapViewProps = {
  className?: string;
  center?: LatLng;
  zoom?: number;
  interactive?: boolean;
  ariaLabel?: string;
  onMapReady?: (map: maplibregl.Map) => void;
  mapRef?: React.MutableRefObject<maplibregl.Map | null>;
};

export function MapView({
  className,
  center = MAP_DEFAULT_CENTER,
  zoom = MAP_DEFAULT_ZOOM,
  interactive = true,
  ariaLabel = 'Delivery tracking map',
  onMapReady,
  mapRef: externalMapRef,
}: MapViewProps) {
  const internal = useMap();
  const mapRef = externalMapRef ?? internal.mapRef;
  const containerRef = internal.containerRef;
  const onReadyRef = useRef(onMapReady);
  onReadyRef.current = onMapReady;

  useMapInstance({
    containerRef,
    mapRef,
    center,
    zoom,
    interactive,
    onReady: (map) => onReadyRef.current?.(map),
  });

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      role="region"
      aria-label={ariaLabel}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
