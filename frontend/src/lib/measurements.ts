import type { CameraAssistDimensionMode, CameraAssistMeasurement } from '@/types';

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

export type Segment2D = [Point2D, Point2D];

export function isSegmentComplete(seg: Point2D[] | null | undefined): seg is Segment2D {
  return seg != null && seg.length === 2;
}

export function segmentMidpoint(seg: Segment2D): Point2D {
  return { x: (seg[0].x + seg[1].x) / 2, y: (seg[0].y + seg[1].y) / 2 };
}

export function segmentAngleDeg(seg: Segment2D): number {
  return (Math.atan2(seg[1].y - seg[0].y, seg[1].x - seg[0].x) * 180) / Math.PI;
}

export function primaryDimensionLabel(mode: CameraAssistDimensionMode): string {
  return mode === 'heightWidth' ? 'Height' : 'Length';
}

export function formatSegmentLabelPx(px: number): string {
  return `${Math.round(px)} px`;
}

export function formatSegmentLabelM(m: number): string {
  return `${m.toFixed(2)} m`;
}

export type TapMeasurePreview = {
  primaryM: number;
  widthM: number;
  areaM2: number;
  dimensionMode: CameraAssistDimensionMode;
};

/** Compute width and area from calibrated primary segment + width segment. */
export function tapMeasurePreview(
  primarySeg: Point2D[] | null,
  widthSeg: Point2D[] | null,
  calibratedPrimaryM: number,
  dimensionMode: CameraAssistDimensionMode = 'lengthWidth'
): TapMeasurePreview | null {
  if (!isSegmentComplete(primarySeg) || !isSegmentComplete(widthSeg)) return null;
  if (!Number.isFinite(calibratedPrimaryM) || calibratedPrimaryM <= 0) return null;
  const primaryPx = pixelDistance(primarySeg[0], primarySeg[1]);
  const widthPx = pixelDistance(widthSeg[0], widthSeg[1]);
  const widthM = metersFromPixelSegment(widthPx, primaryPx, calibratedPrimaryM);
  if (widthM === undefined || widthM <= 0) return null;
  const areaM2 = areaFromLengthWidthM(calibratedPrimaryM, widthM);
  return { primaryM: calibratedPrimaryM, widthM, areaM2, dimensionMode };
}

export type MeasureStep = 'length' | 'calibrate' | 'width' | 'ready';

/** Derive guided tape-measure step from segment state. */
export function deriveMeasureStep(
  primarySeg: Point2D[] | null,
  calibratedPrimaryM: number | null,
  widthSeg: Point2D[] | null
): MeasureStep {
  if (!isSegmentComplete(primarySeg)) return 'length';
  if (calibratedPrimaryM == null || calibratedPrimaryM <= 0) return 'calibrate';
  if (!isSegmentComplete(widthSeg)) return 'width';
  return 'ready';
}

/** Label for a completed or in-progress segment on the overlay. */
export function segmentOverlayLabel(
  seg: Segment2D,
  options: { metres?: number; showPxFallback?: boolean }
): string {
  const px = pixelDistance(seg[0], seg[1]);
  if (options.metres != null && options.metres > 0) {
    return formatSegmentLabelM(options.metres);
  }
  if (options.showPxFallback !== false) {
    return formatSegmentLabelPx(px);
  }
  return '';
}
