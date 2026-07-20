import { LocateFixed, Minus, Plus } from 'lucide-react';
import type maplibregl from 'maplibre-gl';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/hooks/maps/useMap';

type MapControlsProps = {
  map: maplibregl.Map | null;
  className?: string;
  focusPoint?: LatLng | null;
  onLocate?: () => void;
};

export function MapControls({ map, className, focusPoint, onLocate }: MapControlsProps) {
  return (
    <div className={cn('elofix-map-controls', className)}>
      <button
        type="button"
        className="elofix-map-control-btn"
        aria-label="Zoom in"
        onClick={() => map?.zoomIn({ duration: 200 })}
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="elofix-map-control-btn"
        aria-label="Zoom out"
        onClick={() => map?.zoomOut({ duration: 200 })}
      >
        <Minus className="h-4 w-4" />
      </button>
      {(focusPoint || onLocate) && (
        <button
          type="button"
          className="elofix-map-control-btn"
          aria-label="Center on driver"
          onClick={() => {
            if (onLocate) {
              onLocate();
              return;
            }
            if (map && focusPoint) {
              map.easeTo({ center: [focusPoint.lng, focusPoint.lat], zoom: 14, duration: 400 });
            }
          }}
        >
          <LocateFixed className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function CurrentLocationButton({
  className,
  onClick,
  label = 'Center on current location',
}: {
  className?: string;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className={cn('elofix-map-control-btn', className)} aria-label={label} onClick={onClick}>
      <LocateFixed className="h-4 w-4" />
    </button>
  );
}
