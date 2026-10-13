import { dna, DnaFactory, type Strand } from '@atlas-viewer/dna';
import { BaseObject } from './base-object';
import type { SpacialContent } from '../spacial-content/spacial-content';
import type { Paint } from '../world-objects/paint';
import { layoutTextLabel, type LabelLayout, type LabelPoint } from '../modules/canvas-renderer/text-label-layout';

type TextStyle = {
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  opacity?: number;
  haloColor?: string;
  haloWidth?: number;
};
export type TextLabelStyle = TextStyle & { ':hover'?: TextStyle; ':active'?: TextStyle };
export type TextLabelObjectProps = {
  id?: string;
  text: string;
  /** Coordinates in the enclosing world-object. Closed polygons are the default. */
  points: LabelPoint[];
  holes?: LabelPoint[][];
  /** Place an upright label along a visible line segment instead of inside a polygon. */
  open?: boolean;
  style?: TextLabelStyle;
  /** All dimensions are CSS pixels; lineHeight is a multiplier of fontSize. */
  padding?: number;
  maxWidth?: number;
  maxLines?: number;
  lineHeight?: number;
  interactive?: boolean;
};

/** A screen-sized text annotation whose shape is used only for placement. */
export class TextLabelObject extends BaseObject<TextLabelObjectProps> implements SpacialContent {
  readonly type = 'spacial-content';
  readonly isShape = true;
  points = dna(5);
  display = { x: 0, y: 0, width: 0, height: 0, scale: 1, points: dna(5) };
  props: TextLabelObjectProps = { text: '', points: [] };
  hovering = false;
  pressing = false;
  layout?: LabelLayout;
  private toScreen?: (point: LabelPoint) => LabelPoint;

  constructor() {
    super();
    this.addEventListener('pointerenter', () => {
      this.hovering = true;
      this.__revision++;
    });
    this.addEventListener('pointerleave', () => {
      this.hovering = this.pressing = false;
      this.__revision++;
    });
    this.addEventListener('pointerdown', () => {
      this.pressing = true;
      this.__revision++;
    });
    this.addEventListener('pointerup', () => {
      this.pressing = false;
      this.__revision++;
    });
    this.addEventListener('pointercancel', () => {
      this.pressing = false;
      this.__revision++;
    });
  }

  applyProps(props: TextLabelObjectProps) {
    const rings = [props.points, ...(props.holes || [])];
    if (
      typeof props.text !== 'string' ||
      !Array.isArray(props.points) ||
      props.points.length < (props.open ? 2 : 3) ||
      rings.some(
        (ring, i) =>
          !Array.isArray(ring) ||
          (i > 0 && ring.length < 3) ||
          ring.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))
      )
    ) {
      throw new Error('TextLabel requires text and finite polygon or line coordinates');
    }
    for (const value of [props.maxWidth ?? 240, props.maxLines ?? 3, props.lineHeight ?? 1.2]) {
      if (!Number.isFinite(value) || value <= 0) throw new Error('TextLabel layout sizes must be positive');
    }
    if (!Number.isInteger(props.maxLines ?? 3) || !Number.isFinite(props.padding ?? 4) || (props.padding ?? 4) < 0) {
      throw new Error('TextLabel requires a positive integer maxLines and nonnegative padding');
    }
    for (const style of [props.style, props.style?.[':hover'], props.style?.[':active']]) {
      if (!style) continue;
      if (
        !Number.isFinite(style.fontSize ?? 18) ||
        (style.fontSize ?? 18) <= 0 ||
        !Number.isFinite(style.haloWidth ?? 2) ||
        (style.haloWidth ?? 2) < 0 ||
        !Number.isFinite(style.opacity ?? 1) ||
        (style.opacity ?? 1) < 0 ||
        (style.opacity ?? 1) > 1
      ) {
        throw new Error('TextLabel requires a positive fontSize, nonnegative haloWidth and opacity between 0 and 1');
      }
    }
    this.props = props;
    if (props.id) this.id = props.id;
    this.layout = undefined;
    this.updateBounds(1);
    this.__revision++;
  }

  private updateBounds(scale: number) {
    // Lines have no area; include the screen-sized text in broad-phase event selection.
    const pad = this.props.open ? ((this.props.style?.fontSize ?? 18) * (this.props.lineHeight ?? 1.2) + 8) / scale : 0;
    const x = Math.min(...this.props.points.map((p) => p[0])) - pad;
    const y = Math.min(...this.props.points.map((p) => p[1])) - pad;
    const right = Math.max(...this.props.points.map((p) => p[0])) + pad;
    const bottom = Math.max(...this.props.points.map((p) => p[1])) + pad;
    this.points.set(DnaFactory.singleBox(Math.max(1, right - x), Math.max(1, bottom - y), x, y));
    this.display.points.set(this.points);
    this.display.width = this.width;
    this.display.height = this.height;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scale = 1): Paint[] {
    if (target[3] - target[1] === 1 && target[4] - target[2] === 1) {
      return this.intersects([target[1] - this.x, target[2] - this.y]) ? [[this, this.points, aggregate]] : [];
    }
    this.updateBounds(scale > 0 ? scale : 1);
    return [[this, this.points, aggregate]];
  }

  intersects(pointer?: LabelPoint | null): boolean {
    if (!pointer || !this.layout || !this.toScreen || this.props.interactive === false) return false;
    const [x, y] = this.toScreen([pointer[0] + this.x, pointer[1] + this.y]);
    const layout = this.layout,
      dx = x - layout.x,
      dy = y - layout.y;
    const cos = Math.cos(layout.angle),
      sin = Math.sin(layout.angle);
    return Math.abs(dx * cos + dy * sin) <= layout.width / 2 && Math.abs(-dx * sin + dy * cos) <= layout.height / 2;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, dpi: number) {
    const style = {
      ...this.props.style,
      ...(this.hovering ? this.props.style?.[':hover'] : {}),
      ...(this.pressing ? this.props.style?.[':active'] : {}),
    };
    this.layout = undefined;
    if (style.opacity === 0) return;
    const matrix = ctx.getTransform(),
      sx = width / this.width,
      sy = height / this.height;
    const originX = this.x,
      originY = this.y;
    this.toScreen = ([px, py]) => {
      const tx = x + (px - originX) * sx,
        ty = y + (py - originY) * sy;
      return [(matrix.a * tx + matrix.c * ty + matrix.e) / dpi, (matrix.b * tx + matrix.d * ty + matrix.f) / dpi];
    };
    const fontSize = style.fontSize ?? 18,
      lineHeight = fontSize * (this.props.lineHeight ?? 1.2);
    ctx.save();
    try {
      ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
      ctx.font = `${style.fontStyle || 'normal'} ${style.fontWeight || 'normal'} ${fontSize}px ${
        style.fontFamily || 'sans-serif'
      }`;
      this.layout = layoutTextLabel({
        ...this.props,
        points: this.props.points.map(this.toScreen),
        holes: this.props.holes?.map((ring) => ring.map(this.toScreen!)),
        viewportWidth: ctx.canvas.width / dpi,
        viewportHeight: ctx.canvas.height / dpi,
        lineHeight,
        padding: (this.props.padding ?? 4) + (style.haloWidth ?? 2),
        maxWidth: this.props.maxWidth ?? 240,
        maxLines: this.props.maxLines ?? 3,
        measure: (text) => ctx.measureText(text).width,
      });
      if (!this.layout) return;
      ctx.translate(this.layout.x, this.layout.y);
      ctx.rotate(this.layout.angle);
      ctx.globalAlpha *= style.opacity ?? 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = style.color || '#172b4d';
      ctx.strokeStyle = style.haloColor || '#ffffff';
      ctx.lineWidth = (style.haloWidth ?? 2) * 2;
      ctx.lineJoin = 'round';
      this.layout.lines.forEach((text, i) => {
        const y = (i - (this.layout!.lines.length - 1) / 2) * lineHeight;
        if (ctx.lineWidth > 0 && style.haloWidth !== 0) ctx.strokeText(text, 0, y);
        ctx.fillText(text, 0, y);
      });
    } finally {
      ctx.restore();
    }
  }
}
