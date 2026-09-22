import { DnaFactory, transform, type Strand } from '@atlas-viewer/dna';
import { Box } from '../../objects/box';
import { Geometry } from '../../objects/geometry';
import { ImageTexture } from '../../spacial-content/image-texture';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';
import type { HookOptions } from '../../renderer/runtime';
import type { World } from '../../world';
import { DebugRenderer } from '../debug-renderer/debug-renderer';
import type { NavigatorWorldRegion } from './navigator-geometry';

type SharedImages = {
  hostCache?: { get(id: string): HTMLCanvasElement | undefined };
  invalidated?: string[];
};

export type HomeNavigatorOptions = {
  showAnnotations?: boolean;
  background?: string;
  viewportStroke?: string;
  sharedCanvasRenderer?: SharedImages;
  onRequestRender?: () => void;
};

/** A fixed-aspect view of the home viewport, independent of the main canvas tile queue. */
export class HomeNavigatorRenderer extends DebugRenderer {
  private region?: NavigatorWorldRegion;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly loadedAt = new Map<string, number>();
  private readonly failedUrls = new Map<string, number>();
  private activeLoads = 0;
  private readonly worldTarget = DnaFactory.singleBox(1, 1);
  private readonly selectionTarget = DnaFactory.singleBox(1, 1);
  private readonly options: HomeNavigatorOptions;
  private lastTarget = '';
  private dirty = true;
  private idle = false;
  private fading = false;
  private viewRotation = 0;

  constructor(canvas: HTMLCanvasElement, options: HomeNavigatorOptions = {}) {
    super(canvas);
    this.options = options;
    this.context.globalAlpha = 1;
  }

  setRegion(region: NavigatorWorldRegion) {
    if (
      this.region?.x === region.x &&
      this.region?.y === region.y &&
      this.region?.width === region.width &&
      this.region?.height === region.height
    )
      return;
    this.region = region;
    this.failedUrls.clear();
    this.invalidateWorldLayer();
  }

  setShowAnnotations(showAnnotations: boolean) {
    if (this.options.showAnnotations === showAnnotations) return;
    this.options.showAnnotations = showAnnotations;
    this.invalidateWorldLayer();
  }

  invalidateWorldLayer() {
    this.dirty = true;
    this.renderNextFrame = true;
    this.options.onRequestRender?.();
  }

  resize() {
    super.resize();
    this.invalidateWorldLayer();
  }

  pendingUpdate() {
    return !this.idle && (this.dirty || this.renderNextFrame);
  }

  beforeFrame(_world: World, _delta: number, _target: Strand, options?: HookOptions) {
    const rotation = options?.viewRotation || 0;
    if (rotation !== this.viewRotation) this.renderNextFrame = true;
    this.viewRotation = rotation;
  }

  paint() {
    this.renderNextFrame = true;
  }

  afterFrame(world: World, _delta: number, target: Strand) {
    if (this.idle || !this.canvas.width || !this.canvas.height) return;
    const targetKey = `${target[1]},${target[2]},${target[3]},${target[4]}`;
    if (!this.dirty && !this.renderNextFrame && targetKey === this.lastTarget) return;
    const region = this.region || { x: 0, y: 0, width: world.width, height: world.height };
    this.fading = false;
    this.draw(this.canvas, world, target, region);
    this.lastTarget = targetKey;
    this.dirty = false;
    this.renderNextFrame = this.fading;
  }

  private draw(canvas: HTMLCanvasElement, world: World, target: Strand, region: NavigatorWorldRegion) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const scale = Math.min(width / Math.max(1, region.width), height / Math.max(1, region.height));
    const offsetX = (width - region.width * scale) / 2;
    const offsetY = (height - region.height * scale) / 2;
    ctx.clearRect(0, 0, width, height);
    if (this.options.background) {
      ctx.fillStyle = this.options.background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    this.worldTarget[1] = region.x;
    this.worldTarget[2] = region.y;
    this.worldTarget[3] = region.x + region.width;
    this.worldTarget[4] = region.y + region.height;
    const angle = (this.viewRotation * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const selectionWidth = region.width * Math.abs(cosine) + region.height * Math.abs(sine);
    const selectionHeight = region.width * Math.abs(sine) + region.height * Math.abs(cosine);
    this.selectionTarget[1] = region.x + (region.width - selectionWidth) / 2;
    this.selectionTarget[2] = region.y + (region.height - selectionHeight) / 2;
    this.selectionTarget[3] = this.selectionTarget[1] + selectionWidth;
    this.selectionTarget[4] = this.selectionTarget[2] + selectionHeight;
    const layers = world.getPointsAt(this.worldTarget, this.aggregate, scale, this.selectionTarget);
    if (this.viewRotation) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(angle);
      ctx.translate(-width / 2, -height / 2);
    }
    for (const [paint, points, transformation] of layers) {
      const isAnnotation = paint instanceof Box || paint instanceof Geometry;
      if (isAnnotation && !this.options.showAnnotations) continue;
      const position = transformation ? transform(points, transformation) : points;
      const parent = (paint as any).__parent;
      const clipPoints = parent?.renderOptions?.clipToBounds ? parent.crop || parent.points : undefined;
      if (clipPoints) {
        const clip = transformation ? transform(clipPoints, transformation) : clipPoints;
        ctx.save();
        ctx.beginPath();
        ctx.rect(clip[1] + offsetX, clip[2] + offsetY, clip[3] - clip[1], clip[4] - clip[2]);
        ctx.clip();
      }
      for (let index = 0; index < position.length / 5; index++) {
        const n = index * 5;
        if (!position[n]) continue;
        const x = position[n + 1] + offsetX;
        const y = position[n + 2] + offsetY;
        const w = position[n + 3] - position[n + 1];
        const h = position[n + 4] - position[n + 2];
        if (w <= 0 || h <= 0) continue;
        if (isAnnotation) {
          const style = (paint as Box | Geometry).props?.style;
          ctx.globalAlpha = typeof style?.opacity === 'number' ? style.opacity : 1;
          if (paint instanceof Geometry && paint.shape.type === 'polygon') {
            ctx.beginPath();
            paint.shape.points.forEach(([px, py], pointIndex) => {
              if (pointIndex === 0) ctx.moveTo(x + px * scale, y + py * scale);
              else ctx.lineTo(x + px * scale, y + py * scale);
            });
            if (!paint.shape.open) {
              ctx.closePath();
              if (style?.backgroundColor) {
                ctx.fillStyle = style.backgroundColor;
                ctx.fill();
              }
            }
          } else {
            if (style?.backgroundColor) {
              ctx.fillStyle = style.backgroundColor;
              ctx.fillRect(x, y, w, h);
            }
          }
          ctx.strokeStyle = style?.borderColor || '#111';
          ctx.lineWidth = Math.max(1, parseFloat(style?.borderWidth || '1') * scale);
          if (paint instanceof Geometry) ctx.stroke();
          else ctx.strokeRect(x, y, w, h);
          ctx.globalAlpha = 1;
          continue;
        }
        const source =
          paint instanceof ImageTexture
            ? (paint.getTexture()?.source as CanvasImageSource | undefined)
            : paint instanceof SingleImage || paint instanceof TiledImage
            ? this.getImage(paint, index)
            : undefined;
        if (!source) continue;
        let alpha = (paint as any).style?.opacity ?? 1;
        if (paint instanceof SingleImage || paint instanceof TiledImage) {
          const loaded = this.loadedAt.get(paint.getImageUrl(index));
          if (loaded) {
            const progress = Math.min(1, (performance.now() - loaded) / 180);
            alpha *= progress;
            if (progress < 1) this.fading = true;
          }
        }
        ctx.globalAlpha = alpha;
        // Cover fractional tile boundaries so adjacent tiles cannot leave hairline gaps.
        const dx = paint instanceof TiledImage ? Math.floor(x) : x;
        const dy = paint instanceof TiledImage ? Math.floor(y) : y;
        const dw = paint instanceof TiledImage ? Math.ceil(x + w) - dx : w;
        const dh = paint instanceof TiledImage ? Math.ceil(y + h) - dy : h;
        if ((paint instanceof SingleImage || paint instanceof TiledImage) && paint.crop?.[n] && paint.cropData) {
          const sx =
            paint.crop[n + 1] / paint.display.scale -
            paint.display.points[n + 1] +
            paint.cropData.x / paint.display.scale;
          const sy =
            paint.crop[n + 2] / paint.display.scale -
            paint.display.points[n + 2] +
            paint.cropData.y / paint.display.scale;
          const sw = (paint.crop[n + 3] - paint.crop[n + 1]) / paint.display.scale;
          const sh = (paint.crop[n + 4] - paint.crop[n + 2]) / paint.display.scale;
          ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
        } else {
          ctx.drawImage(source, dx, dy, dw, dh);
        }
        ctx.globalAlpha = 1;
      }
      if (clipPoints) ctx.restore();
    }
    if (this.viewRotation) ctx.restore();
    // At home zoom, the viewport outline coincides with the thumbnail edge and aliases there.
    const atHomeZoom =
      Math.abs((target[3] - target[1]) / region.width - 1) <= 0.05 &&
      Math.abs((target[4] - target[2]) / region.height - 1) <= 0.05;
    if (atHomeZoom) return;

    // The viewport is an outline only; the scene under it keeps its original colours.
    const centerX = (target[1] + target[3]) / 2 - region.x - region.width / 2;
    const centerY = (target[2] + target[4]) / 2 - region.y - region.height / 2;
    const vw = (target[3] - target[1]) * scale;
    const vh = (target[4] - target[2]) * scale;
    const vx = width / 2 + (centerX * cosine - centerY * sine) * scale - vw / 2;
    const vy = height / 2 + (centerX * sine + centerY * cosine) * scale - vh / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    const css =
      typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement
        ? getComputedStyle(canvas)
        : undefined;
    ctx.strokeStyle =
      css?.getPropertyValue('--atlas-navigator-viewport-stroke').trim() || this.options.viewportStroke || '#fff';
    const cssLineWidth = parseFloat(css?.getPropertyValue('--atlas-navigator-viewport-line-width') || '');
    ctx.lineWidth = Number.isFinite(cssLineWidth)
      ? cssLineWidth * (canvas.width / (canvas.clientWidth || canvas.width))
      : Math.max(1, width / 180);
    ctx.strokeRect(
      vx + ctx.lineWidth / 2,
      vy + ctx.lineWidth / 2,
      Math.max(0, vw - ctx.lineWidth),
      Math.max(0, vh - ctx.lineWidth)
    );
    ctx.restore();
  }

  private getImage(paint: SingleImage | TiledImage, index: number): CanvasImageSource | undefined {
    const id = paint.__host?.canvas?.canvases?.[index];
    const shared =
      id && !this.options.sharedCanvasRenderer?.invalidated?.includes(id)
        ? this.options.sharedCanvasRenderer?.hostCache?.get(id)
        : undefined;
    if (shared) return shared;
    const url = paint.getImageUrl(index);
    let image = this.images.get(url);
    if (!image) {
      if ((this.failedUrls.get(url) || 0) >= 2 || this.activeLoads >= 4) return undefined;
      image = new Image();
      this.images.set(url, image);
      this.activeLoads++;
      let settled = false;
      const markLoaded = () => {
        if (settled) return;
        settled = true;
        this.activeLoads--;
        this.loadedAt.set(url, performance.now());
        this.invalidateWorldLayer();
      };
      image.onload = markLoaded;
      image.onerror = () => {
        if (settled) return;
        settled = true;
        this.activeLoads--;
        this.images.delete(url);
        this.failedUrls.set(url, (this.failedUrls.get(url) || 0) + 1);
        this.invalidateWorldLayer();
      };
      image.src = url;
      if (image.complete && image.naturalWidth > 0) markLoaded();
    }
    return image.complete && image.naturalWidth > 0 ? image : undefined;
  }

  setIdle(idle: boolean) {
    this.idle = idle;
  }

  reset() {
    for (const image of this.images.values()) image.onload = image.onerror = null;
    this.images.clear();
    this.loadedAt.clear();
    this.failedUrls.clear();
    this.activeLoads = 0;
  }
}
