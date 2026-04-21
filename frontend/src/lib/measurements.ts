import type { CameraAssistMeasurement } from '@/types';

/** Area in square meters from length × width (each in meters). */
export function calculateArea(lengthM: number, widthM: number): number {
  return Number((lengthM * widthM).toFixed(2));
}

/** Convert stored dims + unit to meters. */
export function toMeters(value: number | undefined, unit: 'm' | 'cm'): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return unit === 'cm' ? value / 100 : value;
}

/** Area in m² from a camera-assist payload (for validation / display). `area` on the object is always m² when set. */
export function areaSquareMetersFromAssist(m: CameraAssistMeasurement): number | undefined {
  if (m.area !== undefined && Number.isFinite(m.area) && m.area > 0) {
    return m.area;
  }
  const u = m.unit;
  const wM = toMeters(m.width, u);
  if (wM === undefined || wM <= 0) return undefined;

  if (m.dimensionMode === 'heightWidth') {
    const hM = toMeters(m.height, u);
    if (hM === undefined || hM <= 0) return undefined;
    return calculateArea(hM, wM);
  }

  const lM = toMeters(m.length, u);
  if (lM === undefined || lM <= 0) return undefined;
  return calculateArea(lM, wM);
}

/** Build dimension label e.g. "3.20 m × 2.50 m" */
export function formatDimensionLabel(m: CameraAssistMeasurement): string {
  const u = m.unit === 'cm' ? 'cm' : 'm';
  if (m.dimensionMode === 'heightWidth' && m.height !== undefined && m.width !== undefined) {
    return `${m.height}${u} × ${m.width}${u}`;
  }
  if (m.length !== undefined && m.width !== undefined) {
    return `${m.length}${u} × ${m.width}${u}`;
  }
  return '—';
}

export function formatAreaLabel(areaM2: number | undefined): string {
  if (areaM2 === undefined || !Number.isFinite(areaM2)) return '—';
  return `${areaM2.toFixed(2)} m²`;
}
