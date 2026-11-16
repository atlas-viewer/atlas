export type ComparisonSplit = Readonly<{ angle: number; position: number }>;
export type ViewerPoint = Readonly<{ x: number; y: number }>;
export type ComparisonSide = 'first' | 'second';
export type ViewportHalfPlaneClip = Readonly<{
  normal: ViewerPoint;
  distance: number;
  side: ComparisonSide;
  width: number;
  height: number;
  polygon: readonly ViewerPoint[];
}>;
export type LayerContext = Readonly<{ viewportClip?: ViewportHalfPlaneClip }>;

export function normalizeSplit(split: ComparisonSplit): ComparisonSplit {
  if (!Number.isFinite(split.angle) || !Number.isFinite(split.position))
    throw new TypeError('Comparison split must be finite');
  return Object.freeze({
    angle: ((split.angle % 360) + 360) % 360,
    position: Math.max(0, Math.min(1, split.position)),
  });
}

export function resolveComparisonLine(split: ComparisonSplit, width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Comparison viewport must have positive finite dimensions');
  }
  split = normalizeSplit(split);
  const angle = (split.angle * Math.PI) / 180;
  const normal = { x: Math.cos(angle), y: Math.sin(angle) };
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const projections = corners.map((p) => p.x * normal.x + p.y * normal.y);
  const lo = Math.min(...projections),
    hi = Math.max(...projections);
  return { normal, distance: lo + split.position * (hi - lo), lo, hi, corners, width, height };
}

export function comparisonPositionAtPoint(split: ComparisonSplit, width: number, height: number, point: ViewerPoint) {
  const { normal, lo, hi } = resolveComparisonLine(split, width, height);
  return Math.max(0, Math.min(1, (point.x * normal.x + point.y * normal.y - lo) / (hi - lo)));
}

export function comparisonSideAtPoint(
  line: Pick<ViewportHalfPlaneClip, 'normal' | 'distance'>,
  point: ViewerPoint
): ComparisonSide {
  return point.x * line.normal.x + point.y * line.normal.y < line.distance ? 'first' : 'second';
}

export function resolveComparisonClip(
  split: ComparisonSplit,
  width: number,
  height: number,
  side: ComparisonSide
): ViewportHalfPlaneClip {
  const line = resolveComparisonLine(split, width, height);
  const polygon: ViewerPoint[] = [];
  const sign = side === 'first' ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const a = line.corners[i],
      b = line.corners[(i + 1) % 4];
    const da = sign * (a.x * line.normal.x + a.y * line.normal.y - line.distance);
    const db = sign * (b.x * line.normal.x + b.y * line.normal.y - line.distance);
    if (da <= 0) polygon.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      polygon.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return { normal: line.normal, distance: line.distance, side, width, height, polygon };
}

export function comparisonLineEndpoints(split: ComparisonSplit, width: number, height: number): readonly ViewerPoint[] {
  const line = resolveComparisonLine(split, width, height);
  const points: ViewerPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const a = line.corners[i],
      b = line.corners[(i + 1) % 4];
    const da = a.x * line.normal.x + a.y * line.normal.y - line.distance;
    const db = b.x * line.normal.x + b.y * line.normal.y - line.distance;
    if (Math.abs(da) < 1e-7) points.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      points.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  const unique = points.filter((p, i) => points.findIndex((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6) === i);
  return unique.length ? [unique[0], unique[unique.length - 1]] : [];
}

export function clipPolygonCss(clip: ViewportHalfPlaneClip) {
  return clip.polygon.length >= 3
    ? `polygon(${clip.polygon.map((p) => `${p.x}px ${p.y}px`).join(',')})`
    : 'polygon(0px 0px,0px 0px,0px 0px)';
}
