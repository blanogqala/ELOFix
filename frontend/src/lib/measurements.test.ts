import { describe, expect, it } from 'vitest';
import {
  areaFromLengthWidthM,
  deriveMeasureStep,
  getVideoDisplayRect,
  metersFromPixelSegment,
  overlayPointFromClient,
  pixelDistance,
  tapMeasurePreview,
  type VideoDisplayRect,
} from './measurements';

describe('pixelDistance', () => {
  it('returns hypot between points', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('metersFromPixelSegment', () => {
  it('scales segment by reference', () => {
    expect(metersFromPixelSegment(100, 200, 4)).toBe(2);
  });

  it('returns undefined for invalid input', () => {
    expect(metersFromPixelSegment(0, 200, 4)).toBeUndefined();
  });
});

describe('areaFromLengthWidthM', () => {
  it('rounds to 2 decimals', () => {
    expect(areaFromLengthWidthM(3.333, 2.222)).toBe(7.41);
  });
});

describe('getVideoDisplayRect', () => {
  it('centers wider video in portrait overlay', () => {
    const d = getVideoDisplayRect(320, 180, 1920, 1080);
    expect(d.displayW).toBe(320);
    expect(d.displayH).toBeCloseTo(180);
    expect(d.offsetX).toBe(0);
    expect(d.offsetY).toBeGreaterThanOrEqual(0);
  });
});

describe('overlayPointFromClient', () => {
  it('marks taps outside visible video invalid', () => {
    const rect = { left: 0, top: 0, width: 400, height: 300 } as DOMRect;
    const display: VideoDisplayRect = {
      offsetX: 20,
      offsetY: 0,
      displayW: 360,
      displayH: 300,
    };
    const margin = overlayPointFromClient(5, 150, rect, display);
    expect(margin.valid).toBe(false);
    const inside = overlayPointFromClient(100, 150, rect, display);
    expect(inside.valid).toBe(true);
  });
});

describe('tapMeasurePreview', () => {
  it('computes width and area from segments', () => {
    const preview = tapMeasurePreview(
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      4
    );
    expect(preview?.primaryM).toBe(4);
    expect(preview?.widthM).toBe(2);
    expect(preview?.areaM2).toBe(8);
  });
});

describe('deriveMeasureStep', () => {
  it('walks through steps', () => {
    expect(deriveMeasureStep(null, null, null)).toBe('length');
    expect(deriveMeasureStep([{ x: 0, y: 0 }], null, null)).toBe('length');
    expect(
      deriveMeasureStep(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        null,
        null
      )
    ).toBe('calibrate');
    expect(
      deriveMeasureStep(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        3,
        null
      )
    ).toBe('width');
    expect(
      deriveMeasureStep(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        3,
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]
      )
    ).toBe('ready');
  });
});
