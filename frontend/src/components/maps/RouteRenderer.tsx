import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { RouteLineString } from '@/lib/map/routeApi';
import {
  ROUTE_HALO_COLOR,
  ROUTE_HALO_OPACITY,
  ROUTE_HALO_WIDTH,
  ROUTE_LINE_COLOR,
  ROUTE_LINE_OPACITY,
  ROUTE_LINE_WIDTH,
} from '@/lib/map/mapStyles';

const SOURCE_ID = 'elofix-route';
const HALO_LAYER_ID = 'elofix-route-halo';
const LINE_LAYER_ID = 'elofix-route-line';

type RouteRendererProps = {
  map: maplibregl.Map | null;
  geometry: RouteLineString | null;
};

export function RouteRenderer({ map, geometry }: RouteRendererProps) {
  useEffect(() => {
    if (!map) return;

    const ensureLayer = () => {
      if (!geometry?.coordinates?.length) {
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
        if (map.getLayer(HALO_LAYER_ID)) map.removeLayer(HALO_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        return;
      }

      const data = {
        type: 'Feature' as const,
        geometry,
        properties: {},
      };

      const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
        return;
      }

      map.addSource(SOURCE_ID, { type: 'geojson', data });

      map.addLayer({
        id: HALO_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ROUTE_HALO_COLOR,
          'line-width': ROUTE_LINE_WIDTH + ROUTE_HALO_WIDTH * 2,
          'line-opacity': ROUTE_HALO_OPACITY,
        },
      });

      map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ROUTE_LINE_COLOR,
          'line-width': ROUTE_LINE_WIDTH,
          'line-opacity': ROUTE_LINE_OPACITY,
        },
      });
    };

    const onStyleReady = () => {
      ensureLayer();
    };

    if (map.isStyleLoaded()) {
      ensureLayer();
    } else {
      map.once('load', onStyleReady);
      map.once('style.load', onStyleReady);
    }

    // Re-apply after setStyle / theme changes wipe custom sources.
    map.on('style.load', ensureLayer);

    return () => {
      map.off('load', onStyleReady);
      map.off('style.load', onStyleReady);
      map.off('style.load', ensureLayer);
    };
  }, [map, geometry]);

  return null;
}
