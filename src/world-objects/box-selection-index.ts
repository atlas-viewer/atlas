import { Box } from '../objects/box';
import { Geometry } from '../objects/geometry';
import type { Strand } from '../utility/precise-dna';
import type { Paintable } from './paint';

type Entry = { order: number; x1: number; y1: number; x2: number; y2: number };
type Node = { x1: number; y1: number; x2: number; y2: number; entries?: Entry[]; left?: Node; right?: Node };

function build(entries: Entry[]): Node {
  const node: Node = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const e of entries) {
    node.x1 = Math.min(node.x1, e.x1);
    node.y1 = Math.min(node.y1, e.y1);
    node.x2 = Math.max(node.x2, e.x2);
    node.y2 = Math.max(node.y2, e.y2);
  }
  if (entries.length <= 16) node.entries = entries;
  else {
    const horizontal = node.x2 - node.x1 >= node.y2 - node.y1;
    entries.sort(horizontal ? (a, b) => a.x1 + a.x2 - (b.x1 + b.x2) : (a, b) => a.y1 + a.y2 - (b.y1 + b.y2));
    const middle = entries.length >>> 1;
    node.left = build(entries.slice(0, middle));
    node.right = build(entries.slice(middle));
  }
  return node;
}

/** Only native canvas boxes have a bounded paint footprint we can safely index. */
function padding(box: Box): { pixels: number; world: number } | undefined {
  if (box.props.html || box.props.href || box.props.className) return;
  let size = 1;
  for (const style of [box.props.style, box.props.hoverStyles, box.props.pressStyles]) {
    if (!style) continue;
    if (style.boxShadow) return;
    const border = parseInt(style.borderWidth || style.border || '0', 10);
    const outline = parseInt(style.outlineWidth || style.outline || '0', 10);
    const offset = parseInt(style.outlineOffset || '0', 10);
    if (![border, outline, offset].every(Number.isFinite)) return;
    // Match CanvasRenderer's asymmetric border and outline extents, plus antialiasing.
    size = Math.max(size, 3 * Math.abs(border) + 2 * Math.abs(outline) + Math.abs(offset) + 1);
  }
  // A camera rotation can project an axis-aligned stroke margin onto both axes.
  size *= Math.SQRT2;
  return box.props.relativeStyle ? { pixels: size, world: 0 } : { pixels: Math.SQRT2, world: size };
}

/** Built once per layer revision. Query output retains the original painter's order. */
export class BoxSelectionIndex {
  readonly nonBoxes: Paintable[] = [];
  readonly nonAnnotations: Paintable[] = [];
  private passthrough: number[] = [];
  private root?: Node;
  private entries: Entry[] = [];
  private pixelPadding = 0;
  private worldPadding = 0;

  constructor(private layers: Paintable[]) {
    this.rebuild();
  }

  private rebuild() {
    this.nonBoxes.length = 0;
    this.nonAnnotations.length = 0;
    this.passthrough = [];
    this.pixelPadding = 0;
    this.worldPadding = 0;
    const entries: Entry[] = [];
    for (let order = 0; order < this.layers.length; order++) {
      const layer = this.layers[order];
      if (!layer) continue;
      if (!(layer instanceof Box) && !(layer instanceof Geometry)) this.nonAnnotations.push(layer);
      // Subclasses may implement their own selection/scheduled work; preserve that path.
      const candidate = layer as any;
      const nativeBox =
        candidate.constructor === Box &&
        candidate.getAllPointsAt === Box.prototype.getAllPointsAt &&
        candidate.getObjectsAt === Box.prototype.getObjectsAt &&
        candidate.getScheduledUpdates === Box.prototype.getScheduledUpdates &&
        !(layer as any).rotation;
      if (!nativeBox) this.nonBoxes.push(layer);
      const margin = nativeBox ? padding(layer as Box) : undefined;
      const p = layer.points;
      if (
        !margin ||
        !p ||
        p.length !== 5 ||
        ![p[1], p[2], p[3], p[4]].every(Number.isFinite) ||
        p[3] < p[1] ||
        p[4] < p[2]
      ) {
        this.passthrough.push(order);
        continue;
      }
      entries.push({ order, x1: p[1], y1: p[2], x2: p[3], y2: p[4] });
      this.pixelPadding = Math.max(this.pixelPadding, margin.pixels);
      this.worldPadding = Math.max(this.worldPadding, margin.world);
    }
    // Keep small scenes on the established path, without a tree or query allocations.
    this.entries = entries;
    this.root = entries.length >= 256 ? build(entries) : undefined;
  }

  query(target: Strand, scaleFactor: number, paint = true): Paintable[] {
    if (!this.root || !(scaleFactor > 0) || !Number.isFinite(scaleFactor)) return this.layers;
    // Public strands remain mutable. A cheap numeric snapshot check preserves
    // direct point edits without doing per-leaf transforms/paint collection.
    for (const entry of this.entries) {
      const p = this.layers[entry.order].points;
      if (p.length !== 5 || p[1] !== entry.x1 || p[2] !== entry.y1 || p[3] !== entry.x2 || p[4] !== entry.y2) {
        this.rebuild();
        break;
      }
    }
    const root = this.root;
    if (!root) return this.layers;
    const margin = paint ? this.worldPadding + this.pixelPadding / scaleFactor : 0;
    const x1 = target[1] - margin,
      y1 = target[2] - margin,
      x2 = target[3] + margin,
      y2 = target[4] + margin;
    if (x1 <= root.x1 && y1 <= root.y1 && x2 >= root.x2 && y2 >= root.y2) return this.layers;
    const orders = this.passthrough.slice();
    const visit = (node: Node) => {
      if (node.x2 < x1 || node.x1 > x2 || node.y2 < y1 || node.y1 > y2) return;
      if (node.entries) {
        for (const entry of node.entries) {
          if (entry.x2 >= x1 && entry.x1 <= x2 && entry.y2 >= y1 && entry.y1 <= y2) orders.push(entry.order);
        }
      } else {
        visit(node.left!);
        visit(node.right!);
      }
    };
    visit(root);
    orders.sort((a, b) => a - b);
    return orders.map((order) => this.layers[order]);
  }
}
