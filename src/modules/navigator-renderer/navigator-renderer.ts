import { DnaFactory, type Strand, transform } from '@atlas-viewer/dna';
import { Box } from '../../objects/box';
import { Geometry } from '../../objects/geometry';
import { ImageTexture } from '../../spacial-content/image-texture';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';
import type { World } from '../../world';
import { DebugRenderer } from '../debug-renderer/debug-renderer';

export type NavigatorTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  worldWidth: number;
  worldHeight: number;
};

export type NavigatorRendererStyle = {
  background: string;
  objectFill: string;
  objectStroke: string;
  viewportFill: string;
  viewportStroke: string;
  viewportLineWidth: number;
};

export type NavigatorRendererOptions = {
  style?: Partial<NavigatorRendererStyle>;
  maxRects?: number;
  minVisibleRectSize?: number;
  drawFallbackBoxes?: boolean;
};

const DEFAULT_STYLE: NavigatorRendererStyle = {
  background: 'rgba(15, 23, 42, 0.7)',
  objectFill: 'rgba(56, 189, 248, 0.22)',
  objectStroke: 'rgba(56, 189, 248, 0.62)',
  viewportFill: 'rgba(251, 191, 36, 0.22)',
  viewportStroke: 'rgba(250, 204, 21, 1)',
  viewportLineWidth: 2,
};

type ImageCacheEntry = {
  image: HTMLImageElement;
  status: 'loading' | 'loaded' | 'error';
};

export function getNavigatorWorldTransform(
  worldWidth: number,
  worldHeight: number,
  navigatorWidth: number,
  navigatorHeight: number
): NavigatorTransform {
  const safeWorldWidth = Math.max(1, worldWidth);
  const safeWorldHeight = Math.max(1, worldHeight);
  const scale = Math.min(navigatorWidth / safeWorldWidth, navigatorHeight / safeWorldHeight);

  const drawnWidth = safeWorldWidth * scale;
  const drawnHeight = safeWorldHeight * scale;

  return {
    scale,
    offsetX: (navigatorWidth - drawnWidth) / 2,
    offsetY: (navigatorHeight - drawnHeight) / 2,
    worldWidth: safeWorldWidth,
    worldHeight: safeWorldHeight,
  };
}

export function navigatorToWorldPoint(transform: NavigatorTransform, x: number, y: number): { x: number; y: number } {
  if (!transform.scale || !Number.isFinite(transform.scale)) {
    return { x: 0, y: 0 };
  }

  const worldX = (x - transform.offsetX) / transform.scale;
  const worldY = (y - transform.offsetY) / transform.scale;

  return {
    x: Math.max(0, Math.min(transform.worldWidth, worldX)),
    y: Math.max(0, Math.min(transform.worldHeight, worldY)),
  };
}

export class NavigatorRenderer extends DebugRenderer {
  private readonly style: NavigatorRendererStyle;
  private readonly maxRects: number;
  private readonly minVisibleRectSize: number;
  private readonly drawFallbackBoxes: boolean;
  private readonly baseCanvas: HTMLCanvasElement;
  private readonly baseContext: CanvasRenderingContext2D;
  private readonly worldTarget: Strand = DnaFactory.singleBox(1, 1, 0, 0);
  private readonly previewImageCache = new Map<string, ImageCacheEntry>();

  private worldLayerDirty = true;
  private lastWorldWidth = 0;
  private lastWorldHeight = 0;
  private lastTargetX = Number.NaN;
  private lastTargetY = Number.NaN;
  private lastTargetX2 = Number.NaN;
  private lastTargetY2 = Number.NaN;

  constructor(canvas: HTMLCanvasElement, options: NavigatorRendererOptions = {}) {
    super(canvas);
    this.style = { ...DEFAULT_STYLE, ...(options.style || {}) };
    this.maxRects = Math.max(100, options.maxRects || 5000);
    this.minVisibleRectSize = Math.max(1, options.minVisibleRectSize || 1);
    this.drawFallbackBoxes = options.drawFallbackBoxes !== false;
    this.context.globalAlpha = 1;
    this.context.imageSmoothingEnabled = false;

    this.baseCanvas = document.createElement('canvas');
    this.baseContext = this.baseCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.baseContext.imageSmoothingEnabled = true;

    this.syncBaseLayerCanvas();
  }

  invalidateWorldLayer() {
    this.worldLayerDirty = true;
    this.renderNextFrame = true;
  }

  resize() {
    super.resize();
    this.syncBaseLayerCanvas();
    this.invalidateWorldLayer();
  }

  beforeFrame(world: World) {
    if (world.width !== this.lastWorldWidth || world.height !== this.lastWorldHeight) {
      this.lastWorldWidth = world.width;
      this.lastWorldHeight = world.height;
      this.invalidateWorldLayer();
    }
  }

  paint() {
    this.renderNextFrame = true;
  }

  pendingUpdate(): boolean {
    return this.renderNextFrame || this.worldLayerDirty;
  }

  afterFrame(world: World, _delta: number, target: Strand) {
    if (this.canvas.width <= 0 || this.canvas.height <= 0) {
      this.renderNextFrame = true;
      return;
    }

    const viewportChanged = this.hasViewportChanged(target);
    const shouldRender = this.renderNextFrame || this.worldLayerDirty || viewportChanged;

    if (!shouldRender) {
      return;
    }

    if (this.baseCanvas.width !== this.canvas.width || this.baseCanvas.height !== this.canvas.height) {
      this.syncBaseLayerCanvas();
      this.worldLayerDirty = true;
    }

    if (this.baseCanvas.width <= 0 || this.baseCanvas.height <= 0) {
      this.renderNextFrame = true;
      return;
    }

    if (this.worldLayerDirty) {
      this.renderWorldLayer(world);
      this.worldLayerDirty = false;
    }

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.baseCanvas, 0, 0);
    this.renderViewportBox(world, target);

    this.lastTargetX = target[1];
    this.lastTargetY = target[2];
    this.lastTargetX2 = target[3];
    this.lastTargetY2 = target[4];
    this.renderNextFrame = false;
  }

  private hasViewportChanged(target: Strand) {
    return (
      this.lastTargetX !== target[1] ||
      this.lastTargetY !== target[2] ||
      this.lastTargetX2 !== target[3] ||
      this.lastTargetY2 !== target[4]
    );
  }

  private syncBaseLayerCanvas() {
    this.baseCanvas.width = this.canvas.width;
    this.baseCanvas.height = this.canvas.height;
  }

  private renderWorldLayer(world: World) {
    const ctx = this.baseContext;
    ctx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    ctx.fillStyle = this.style.background;
    ctx.fillRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);

    const navigatorTransform = getNavigatorWorldTransform(
      world.width,
      world.height,
      this.baseCanvas.width,
      this.baseCanvas.height
    );

    this.worldTarget[1] = 0;
    this.worldTarget[2] = 0;
    this.worldTarget[3] = world.width;
    this.worldTarget[4] = world.height;

    const points = world.getPointsAt(this.worldTarget, this.aggregate, navigatorTransform.scale);
    let drawn = 0;

    for (let p = 0; p < points.length; p++) {
      if (drawn >= this.maxRects) {
        break;
      }

      const paint = points[p][0] as any;
      const point = points[p][1];
      const transformation = points[p][2];
      const position = transformation ? transform(point, transformation) : point;
      const total = position.length / 5;

      for (let i = 0; i < total; i++) {
        if (drawn >= this.maxRects) {
          break;
        }

        const key = i * 5;
        if (position[key] === 0) {
          continue;
        }

        const x = position[key + 1] + navigatorTransform.offsetX;
        const y = position[key + 2] + navigatorTransform.offsetY;
        const width = Math.max(this.minVisibleRectSize, position[key + 3] - position[key + 1]);
        const height = Math.max(this.minVisibleRectSize, position[key + 4] - position[key + 2]);

        if (paint instanceof Geometry) {
          this.renderGeometry(ctx, paint, x, y, navigatorTransform.scale);
        } else if (paint instanceof Box) {
          this.renderBox(ctx, paint, x, y, width, height, navigatorTransform.scale);
        } else if (!this.renderImagePaint(ctx, paint, i, x, y, width, height)) {
          if (this.drawFallbackBoxes) {
            this.renderFallbackBox(ctx, x, y, width, height);
          }
        }

        drawn++;
      }
    }
  }

  private renderFallbackBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    const px = Math.round(x);
    const py = Math.round(y);
    const pw = Math.max(1, Math.round(width));
    const ph = Math.max(1, Math.round(height));

    ctx.fillStyle = this.style.objectFill;
    ctx.strokeStyle = this.style.objectStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(px, py, pw, ph);
    if (pw > 2 && ph > 2) {
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    }
  }

  private renderImagePaint(
    ctx: CanvasRenderingContext2D,
    paint: unknown,
    index: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    if (width <= 0 || height <= 0) {
      return false;
    }

    let source: CanvasImageSource | undefined;

    if (paint instanceof ImageTexture) {
      source = paint.getTexture()?.source as CanvasImageSource | undefined;
    } else if (paint instanceof SingleImage || paint instanceof TiledImage) {
      if (typeof paint.getImageUrl !== 'function') {
        return false;
      }
      const imageUrl = paint.getImageUrl(index);
      source = this.getLoadedPreviewImage(imageUrl);
    }

    if (!source) {
      return false;
    }

    const dw = Math.max(1, Math.round(width));
    const dh = Math.max(1, Math.round(height));
    ctx.drawImage(source, Math.round(x), Math.round(y), dw, dh);
    return true;
  }

  private getLoadedPreviewImage(imageUrl: string): HTMLImageElement | undefined {
    const cached = this.previewImageCache.get(imageUrl);
    if (cached) {
      if (cached.status === 'loading' && cached.image.complete) {
        if (cached.image.naturalWidth > 0 && cached.image.naturalHeight > 0) {
          cached.status = 'loaded';
          this.invalidateWorldLayer();
          return cached.image;
        }
        cached.status = 'error';
        return undefined;
      }
      return cached.status === 'loaded' ? cached.image : undefined;
    }

    const image = new Image();
    const entry: ImageCacheEntry = {
      image,
      status: 'loading',
    };
    this.previewImageCache.set(imageUrl, entry);

    image.onload = () => {
      entry.status = 'loaded';
      this.invalidateWorldLayer();
    };

    image.onerror = () => {
      entry.status = 'error';
    };

    image.src = imageUrl;
    return undefined;
  }

  private renderBox(
    ctx: CanvasRenderingContext2D,
    paint: Box,
    x: number,
    y: number,
    width: number,
    height: number,
    worldScale: number
  ) {
    const style = paint.props?.style;

    if (!style) {
      this.renderFallbackBox(ctx, x, y, width, height);
      return;
    }

    const fill = style.backgroundColor || this.style.objectFill;
    const stroke = style.borderColor || this.style.objectStroke;
    const borderWidthRaw = style.borderWidth ? parseInt(style.borderWidth, 10) : 0;
    const borderWidth = Math.max(0, borderWidthRaw * (paint.props?.relativeStyle ? 1 : worldScale));

    ctx.globalAlpha = typeof style.opacity === 'number' ? style.opacity : 1;
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));

    if (borderWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, borderWidth);
      ctx.strokeRect(
        Math.round(x) + ctx.lineWidth / 2,
        Math.round(y) + ctx.lineWidth / 2,
        Math.max(1, Math.round(width)) - ctx.lineWidth,
        Math.max(1, Math.round(height)) - ctx.lineWidth
      );
    }

    ctx.globalAlpha = 1;
  }

  private renderGeometry(ctx: CanvasRenderingContext2D, paint: Geometry, x: number, y: number, worldScale: number) {
    const shape = paint.shape;
    if (shape.type !== 'polygon' || shape.points.length === 0) {
      return;
    }

    const style = paint.props?.style || {};
    const fill = style.backgroundColor || this.style.objectFill;
    const stroke = style.borderColor || this.style.objectStroke;
    const borderWidthRaw = style.borderWidth ? parseInt(style.borderWidth, 10) : 0;
    const borderWidth = Math.max(0, borderWidthRaw * (paint.props?.relativeStyle ? 1 : worldScale));

    ctx.globalAlpha = typeof style.opacity === 'number' ? style.opacity : 1;
    ctx.beginPath();

    for (let i = 0; i < shape.points.length; i++) {
      const px = x + shape.points[i][0] * worldScale;
      const py = y + shape.points[i][1] * worldScale;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    if (!shape.open) {
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }

    if (borderWidth > 0 || shape.open) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, borderWidth || 1);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  private renderViewportBox(world: World, target: Strand) {
    const transform = getNavigatorWorldTransform(world.width, world.height, this.canvas.width, this.canvas.height);

    const x = target[1] * transform.scale + transform.offsetX;
    const y = target[2] * transform.scale + transform.offsetY;
    const width = (target[3] - target[1]) * transform.scale;
    const height = (target[4] - target[2]) * transform.scale;

    const px = Math.round(x);
    const py = Math.round(y);
    const pw = Math.max(1, Math.round(width));
    const ph = Math.max(1, Math.round(height));

    this.context.fillStyle = this.style.viewportFill;
    this.context.fillRect(px, py, pw, ph);

    this.context.strokeStyle = this.style.viewportStroke;
    this.context.lineWidth = Math.max(1, this.style.viewportLineWidth);
    this.context.strokeRect(px + 0.5, py + 0.5, Math.max(1, pw - 1), Math.max(1, ph - 1));
  }
}
