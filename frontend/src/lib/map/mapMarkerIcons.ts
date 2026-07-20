import { MAP_BRAND } from '@/lib/map/mapStyles';

/** Bearing in degrees (0 = north), clockwise. */
export function bearingBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export type MapMarkerImage = {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
};

/** Top-down courier vehicle (rotates with heading) — ELOFix navy. */
export function vehicleMarkerImage(rotationDeg = 0): MapMarkerImage {
  const r = Math.round(rotationDeg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <defs>
    <filter id="vehShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#082849" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g transform="rotate(${r} 24 24)" filter="url(#vehShadow)">
    <ellipse cx="24" cy="26" rx="11" ry="15" fill="${MAP_BRAND.primary}" stroke="#ffffff" stroke-width="2.5"/>
    <rect x="18" y="10" width="12" height="8" rx="3" fill="${MAP_BRAND.primaryMid}" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="17" cy="30" r="2.5" fill="${MAP_BRAND.primaryMid}"/>
    <circle cx="31" cy="30" r="2.5" fill="${MAP_BRAND.primaryMid}"/>
    <circle cx="24" cy="14" r="2" fill="#ffffff" opacity="0.95"/>
  </g>
</svg>`;
  return { url: svgDataUrl(svg), width: 44, height: 44, anchorX: 22, anchorY: 22 };
}

export type DestinationPinKind = 'collection' | 'delivery';

/** Drop-off / pickup pin — accent orange (collect) / coral (deliver). */
export function destinationMarkerImage(kind: DestinationPinKind): MapMarkerImage {
  const fill = kind === 'collection' ? MAP_BRAND.accent : MAP_BRAND.delivery;
  const label = kind === 'collection' ? 'P' : 'D';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 48" width="36" height="48">
  <defs>
    <filter id="pinShadow" x="-20%" y="-10%" width="140%" height="130%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#000000" flood-opacity="0.25"/>
    </filter>
  </defs>
  <g filter="url(#pinShadow)">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
    <text x="18" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#ffffff">${label}</text>
  </g>
</svg>`;
  return { url: svgDataUrl(svg), width: 32, height: 42, anchorX: 16, anchorY: 42 };
}

export function createVehicleMarkerElement(rotationDeg = 0): HTMLDivElement {
  const img = vehicleMarkerImage(rotationDeg);
  const el = document.createElement('div');
  el.className = 'elofix-map-marker elofix-map-marker-vehicle';
  el.style.backgroundImage = `url("${img.url}")`;
  el.style.width = `${img.width}px`;
  el.style.height = `${img.height}px`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.transformOrigin = 'center center';
  return el;
}

export function createDestinationMarkerElement(kind: DestinationPinKind): HTMLDivElement {
  const img = destinationMarkerImage(kind);
  const el = document.createElement('div');
  el.className = 'elofix-map-marker elofix-map-marker-destination';
  el.style.backgroundImage = `url("${img.url}")`;
  el.style.width = `${img.width}px`;
  el.style.height = `${img.height}px`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundRepeat = 'no-repeat';
  return el;
}
