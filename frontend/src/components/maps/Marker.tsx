import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import { useMapLibre } from '@/components/maps/MapProvider';
import {
  createDestinationMarkerElement,
  createVehicleMarkerElement,
  type DestinationPinKind,
} from '@/lib/map/mapMarkerIcons';
import type { LatLng } from '@/hooks/maps/useMap';

type MarkerProps = {
  map: maplibregl.Map | null;
  position: LatLng | null;
  kind: 'vehicle' | 'destination';
  headingDeg?: number;
  pinKind?: DestinationPinKind;
};

export function MapMarker({
  map,
  position,
  kind,
  headingDeg = 0,
  pinKind = 'delivery',
}: MarkerProps) {
  const { maplibre } = useMapLibre();
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map || !maplibre || !position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const el =
      kind === 'vehicle'
        ? createVehicleMarkerElement(headingDeg)
        : createDestinationMarkerElement(pinKind);

    markerRef.current?.remove();
    markerRef.current = new maplibre.Marker({ element: el, anchor: 'center' })
      .setLngLat([position.lng, position.lat])
      .addTo(map);

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, maplibre, position, kind, headingDeg, pinKind]);

  return null;
}
