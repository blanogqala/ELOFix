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

export type Point2D = { x: number; y: number };

/** Pixel distance between two overlay points. */
export function pixelDistance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Real-world metres for a pixel segment, calibrated from a reference segment.
 * scale-invariant: segmentM = (segmentPx / referencePx) * referenceM
 */
export function metersFromPixelSegment(
  segmentPx: number,
  referencePx: number,
  referenceM: number
): number | undefined {
  if (!Number.isFinite(segmentPx) || segmentPx <= 0) return undefined;
  if (!Number.isFinite(referencePx) || referencePx <= 0) return undefined;
  if (!Number.isFinite(referenceM) || referenceM <= 0) return undefined;
  return (segmentPx / referencePx) * referenceM;
}

/** Area in m² from length × width (metres), rounded to 2 decimals. */
export function areaFromLengthWidthM(lengthM: number, widthM: number): number {
  return calculateArea(lengthM, widthM);
}

export type VideoDisplayRect = {
  offsetX: number;
  offsetY: number;
  displayW: number;
  displayH: number;
};

/** Visible video bounds inside an object-cover container. */
export function getVideoDisplayRect(
  overlayW: number,
  overlayH: number,
  videoW: number,
  videoH: number
): VideoDisplayRect {
  if (overlayW <= 0 || overlayH <= 0 || videoW <= 0 || videoH <= 0) {
    return { offsetX: 0, offsetY: 0, displayW: overlayW, displayH: overlayH };
  }
  const scale = Math.max(overlayW / videoW, overlayH / videoH);
  const displayW = videoW * scale;
  const displayH = videoH * scale;
  return {
    offsetX: (overlayW - displayW) / 2,
    offsetY: (overlayH - displayH) / 2,
    displayW,
    displayH,
  };
}

/** Map a client click to overlay coordinates; valid only inside the visible video region. */
export function overlayPointFromClient(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  display: VideoDisplayRect
): { x: number; y: number; valid: boolean } {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const inX = x >= display.offsetX && x <= display.offsetX + display.displayW;
  const inY = y >= display.offsetY && y <= display.offsetY + display.displayH;
  return { x, y, valid: inX && inY };
}

export type TapMeasurePreview = {
  lengthM: number;
  widthM: number;
  areaM2: number;
};

/** Compute width and area from tap calibration (length segment + width segment + real length in m). */
export function tapMeasurePreview(
  lengthPts: Point2D[],
  widthPts: Point2D[],
  calibratedLengthM: number
): TapMeasurePreview | null {
  if (lengthPts.length !== 2 || widthPts.length !== 2) return null;
  if (!Number.isFinite(calibratedLengthM) || calibratedLengthM <= 0) return null;
  const lengthPx = pixelDistance(lengthPts[0], lengthPts[1]);
  const widthPx = pixelDistance(widthPts[0], widthPts[1]);
  const widthM = metersFromPixelSegment(widthPx, lengthPx, calibratedLengthM);
  if (widthM === undefined || widthM <= 0) return null;
  const areaM2 = areaFromLengthWidthM(calibratedLengthM, widthM);
  return { lengthM: calibratedLengthM, widthM, areaM2 };
}

export type MeasureStep = 'length' | 'calibrate' | 'width' | 'ready';

/** Derive guided tap step from current tap state. */
export function deriveMeasureStep(
  tapLengthPts: Point2D[],
  calibratedLengthM: number | null,
  tapWidthPts: Point2D[]
): MeasureStep {
  if (tapLengthPts.length < 2) return 'length';
  if (calibratedLengthM == null || calibratedLengthM <= 0) return 'calibrate';
  if (tapWidthPts.length < 2) return 'width';
  return 'ready';
}
