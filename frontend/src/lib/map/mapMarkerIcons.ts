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

/** Top-down courier vehicle (rotates with heading). */
export function vehicleMarkerIcon(rotationDeg = 0): google.maps.Icon {
  const r = Math.round(rotationDeg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
  <g transform="rotate(${r} 24 24)">
    <ellipse cx="24" cy="26" rx="11" ry="15" fill="#1a73e8" stroke="#ffffff" stroke-width="2.5"/>
    <rect x="18" y="10" width="12" height="8" rx="3" fill="#174ea6" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="17" cy="30" r="2.5" fill="#0d47a1"/>
    <circle cx="31" cy="30" r="2.5" fill="#0d47a1"/>
    <circle cx="24" cy="14" r="2" fill="#ffffff" opacity="0.9"/>
  </g>
</svg>`;
  return {
    url: svgDataUrl(svg),
    scaledSize: { width: 44, height: 44 } as google.maps.Size,
    anchor: { x: 22, y: 22 } as google.maps.Point,
  };
}

export type DestinationPinKind = 'collection' | 'delivery';

/** Drop-off / pickup pin at route end. */
export function destinationMarkerIcon(kind: DestinationPinKind): google.maps.Icon {
  const fill = kind === 'collection' ? '#ea8600' : '#d93025';
  const label = kind === 'collection' ? 'P' : 'D';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 48" width="36" height="48">
  <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30s18-16.5 18-30C36 8.06 27.94 0 18 0z" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
  <text x="18" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#ffffff">${label}</text>
</svg>`;
  return {
    url: svgDataUrl(svg),
    scaledSize: { width: 32, height: 42 } as google.maps.Size,
    anchor: { x: 16, y: 42 } as google.maps.Point,
  };
}
