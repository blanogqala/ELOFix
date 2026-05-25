import type { Point2D, Segment2D } from '@/lib/measurements';

const MIN_LABEL_WIDTH = 56;

function MeasureLineLabel({
  a,
  b,
  text,
}: {
  a: Point2D;
  b: Point2D;
  text: string;
}) {
  if (!text) return null;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const flip = angle > 90 || angle < -90;
  const rot = flip ? angle + 180 : angle;
  const w = Math.max(MIN_LABEL_WIDTH, text.length * 7.5 + 16);
  const h = 22;
  const labelY = -14;

  return (
    <g transform={`translate(${mid.x},${mid.y}) rotate(${rot})`} pointerEvents="none">
      <rect
        x={-w / 2}
        y={labelY - h / 2}
        width={w}
        height={h}
        rx={4}
        fill="rgba(0,0,0,0.82)"
      />
      <text
        x={0}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={12}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}

function TapeSegment({
  seg,
  stroke,
  fill,
  label,
  dashed,
}: {
  seg: Segment2D;
  stroke: string;
  fill: string;
  label: string;
  dashed?: boolean;
}) {
  const [a, b] = seg;
  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={dashed ? '6 4' : undefined}
      />
      <circle cx={a.x} cy={a.y} r={7} fill={fill} stroke="white" strokeWidth={2} />
      <circle cx={b.x} cy={b.y} r={7} fill={fill} stroke="white" strokeWidth={2} />
      <MeasureLineLabel a={a} b={b} text={label} />
    </g>
  );
}

export interface TapeMeasureOverlayProps {
  width: number;
  height: number;
  primarySeg: Segment2D | null;
  widthSeg: Segment2D | null;
  activeDrag: { anchor: Point2D; current: Point2D } | null;
  primaryLabel: string;
  widthLabel: string;
  dragLabel: string;
  primaryStroke?: string;
  widthStroke?: string;
}

export function TapeMeasureOverlay({
  width,
  height,
  primarySeg,
  widthSeg,
  activeDrag,
  primaryLabel,
  widthLabel,
  dragLabel,
  primaryStroke = 'hsl(var(--primary))',
  widthStroke = 'hsl(var(--accent))',
}: TapeMeasureOverlayProps) {
  const dragSeg: Segment2D | null = activeDrag
    ? [activeDrag.anchor, activeDrag.current]
    : null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      width={width}
      height={height}
      aria-hidden
    >
      {primarySeg && (
        <TapeSegment seg={primarySeg} stroke={primaryStroke} fill={primaryStroke} label={primaryLabel} />
      )}
      {widthSeg && (
        <TapeSegment seg={widthSeg} stroke={widthStroke} fill={widthStroke} label={widthLabel} />
      )}
      {dragSeg && (
        <TapeSegment
          seg={dragSeg}
          stroke={widthSeg ? widthStroke : primaryStroke}
          fill={widthSeg ? widthStroke : primaryStroke}
          label={dragLabel}
          dashed
        />
      )}
    </svg>
  );
}
