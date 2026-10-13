export type LabelPoint = [number, number];
export type LabelLayout = {
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  lines: string[];
};

type Interval = [number, number];

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const left of a)
    for (const right of b) {
      const start = Math.max(left[0], right[0]),
        end = Math.min(left[1], right[1]);
      if (end > start) result.push([start, end]);
    }
  return result;
}

function scanline(rings: LabelPoint[][], y: number): Interval[] {
  const crossings: number[] = [];
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i];
      if (a[1] > y !== b[1] > y) crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
  crossings.sort((a, b) => a - b);
  const result: Interval[] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) result.push([crossings[i], crossings[i + 1]]);
  return result;
}

function wrap(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Layout in CSS pixels, independent of the camera scale and device pixel ratio. */
export function layoutTextLabel(options: {
  text: string;
  points: LabelPoint[];
  holes?: LabelPoint[][];
  open?: boolean;
  viewportWidth: number;
  viewportHeight: number;
  lineHeight: number;
  padding: number;
  maxWidth: number;
  maxLines: number;
  measure: (text: string) => number;
}): LabelLayout | undefined {
  const { points, measure, padding, lineHeight, viewportWidth: vw, viewportHeight: vh } = options;
  if (!options.text.trim() || points.length < 2) return;
  if (options.open) {
    const text = options.text.replace(/\s+/g, ' ').trim(),
      width = measure(text);
    // Inset the viewport by the label's radius so even a rotated label stays on screen.
    const margin = Math.hypot(width, lineHeight) / 2 + padding;
    let best: LabelLayout | undefined,
      longest = -1;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const fullLength = Math.hypot(dx, dy);
      if (fullLength < width + padding * 2) continue;
      let start = (width / 2 + padding) / fullLength,
        end = 1 - start;
      for (const [origin, delta, min, max] of [
        [a[0], dx, margin, vw - margin],
        [a[1], dy, margin, vh - margin],
      ]) {
        if (min > max || (!delta && (origin < min || origin > max))) {
          end = -1;
          break;
        }
        if (delta) {
          const t1 = (min - origin) / delta,
            t2 = (max - origin) / delta;
          start = Math.max(start, Math.min(t1, t2));
          end = Math.min(end, Math.max(t1, t2));
        }
      }
      const length = Math.hypot(dx, dy) * (end - start);
      if (end < start || length <= longest) continue;
      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      const middle = (start + end) / 2;
      best = { x: a[0] + dx * middle, y: a[1] + dy * middle, angle, width, height: lineHeight, lines: [text] };
      longest = length;
    }
    return best;
  }

  const rings = [points, ...(options.holes || [])];
  const top = Math.max(padding, Math.min(...points.map((p) => p[1])));
  const bottom = Math.min(vh - padding, Math.max(...points.map((p) => p[1])));
  const left = Math.max(padding, Math.min(...points.map((p) => p[0])));
  const right = Math.min(vw - padding, Math.max(...points.map((p) => p[0])));
  const centerX = (left + right) / 2,
    centerY = (top + bottom) / 2;
  const maxWidth = Math.min(options.maxWidth, right - left - padding * 2);
  if (maxWidth <= 0 || bottom <= top) return;
  for (const fraction of [1, 0.75, 0.5, 0.33]) {
    const lines = wrap(options.text, maxWidth * fraction, measure);
    if (lines.length > options.maxLines) continue;
    const width = Math.max(...lines.map(measure)),
      height = lines.length * lineHeight;
    const halfHeight = height / 2 + padding;
    if (height + padding * 2 > bottom - top) continue;
    const candidates = [centerY];
    for (let i = 0; i <= 32; i++) candidates.push(top + halfHeight + ((bottom - top - halfHeight * 2) * i) / 32);
    candidates.sort((a, b) => Math.abs(a - centerY) - Math.abs(b - centerY));
    for (const y of candidates) {
      const y1 = y - halfHeight,
        y2 = y + halfHeight;
      // A rectangle must fit throughout its height, including concave edges and holes.
      const samples = [y1, y2];
      for (const ring of rings)
        for (const p of ring) if (p[1] > y1 && p[1] < y2) samples.push(p[1] - 1e-5, p[1] + 1e-5);
      let spans: Interval[] = [[left, right]];
      for (const sample of samples) spans = intersect(spans, scanline(rings, sample));
      const valid = spans.filter(([a, b]) => b - a >= width + padding * 2);
      if (!valid.length) continue;
      const centers = valid.map(([a, b]) =>
        Math.max(a + width / 2 + padding, Math.min(b - width / 2 - padding, centerX))
      );
      centers.sort((a, b) => Math.abs(a - centerX) - Math.abs(b - centerX));
      return { x: centers[0], y, width, height, angle: 0, lines };
    }
  }
}
