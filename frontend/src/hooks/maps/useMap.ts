import { useEffect, useRef, useCallback, type RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { useMapLibre } from '@/components/maps/MapProvider';
import {
  MAP_BOUNDS_PADDING,
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
} from '@/lib/map/mapStyles';

export type LatLng = { lat: number; lng: number };

export type MapBounds = {
  sw: LatLng;
  ne: LatLng;
};

export function useMap() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fitBounds = useCallback((bounds: MapBounds, padding = MAP_BOUNDS_PADDING) => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(
      [
        [bounds.sw.lng, bounds.sw.lat],
        [bounds.ne.lng, bounds.ne.lat],
      ],
      { padding, duration: 500 }
    );
  }, []);

  const fitPoints = useCallback((points: LatLng[], padding = MAP_BOUNDS_PADDING) => {
    if (points.length === 0) return;
    const map = mapRef.current;
    if (!map) return;
    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 14, duration: 500 });
      return;
    }
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding, duration: 500 }
    );
  }, []);

  const setCenter = useCallback((point: LatLng, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [point.lng, point.lat],
      zoom: zoom ?? map.getZoom(),
      duration: 400,
    });
  }, []);

  return {
    mapRef,
    containerRef,
    fitBounds,
    fitPoints,
    setCenter,
  };
}

type UseMapInstanceOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<maplibregl.Map | null>;
  center?: LatLng;
  zoom?: number;
  interactive?: boolean;
  onReady?: (map: maplibregl.Map) => void;
};

export function useMapInstance({
  containerRef,
  mapRef,
  center = MAP_DEFAULT_CENTER,
  zoom = MAP_DEFAULT_ZOOM,
  interactive = true,
  onReady,
}: UseMapInstanceOptions) {
  const { isLoaded, loadError, maplibre, styleUrl } = useMapLibre();
  const appliedStyleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !maplibre || !containerRef.current || mapRef.current) return;

    const map = new maplibre.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
      interactive,
    });

    mapRef.current = map;
    appliedStyleRef.current = styleUrl;
    map.on('load', () => onReady?.(map));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      appliedStyleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount only
  }, [isLoaded, maplibre, styleUrl, containerRef, mapRef, interactive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    // Avoid setStyle on the style the map was already created with — that tears down
    // GeoJSON route layers and can leave RouteRenderer waiting on a one-shot `load`.
    if (appliedStyleRef.current === styleUrl) return;
    appliedStyleRef.current = styleUrl;
    map.setStyle(styleUrl);
  }, [styleUrl, isLoaded, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 400 });
  }, [center.lat, center.lng, isLoaded, mapRef]);

  return { isLoaded, loadError, maplibre };
}
