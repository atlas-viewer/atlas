import { DnaFactory, type Strand, transform } from '@atlas-viewer/dna';
import { Box } from '../../objects/box';
import { Geometry } from '../../objects/geometry';
import { ImageTexture } from '../../spacial-content/image-texture';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';
import type { World } from '../../world';
import type { ZoneInterface } from '../../world-objects/zone';
import { DebugRenderer } from '../debug-renderer/debug-renderer';

export type NavigatorTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
  worldX: number;
  worldY: number;
  worldWidth: number;
  worldHeight: number;
};

export type NavigatorWorldRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
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
  zoneWindow?: NavigatorZoneWindowOptions;
};

export type NavigatorZoneWindowOptions = {
  total?: number;
  before?: number;
  after?: number;
};

export type NavigatorWorldRegionOptions = {
  target?: Strand | { x: number; y: number; width: number; height: number };
  zoneWindow?: NavigatorZoneWindowOptions;
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

type ZoneBounds = {
  zone: ZoneInterface;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ResolvedZoneWindow = {
  total: number;
  before: number;
  after: number;
};

function toInt(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.floor(value);
}

function resolveZoneWindow(
  zoneWindow: NavigatorZoneWindowOptions | undefined,
  zoneCount: number
): ResolvedZoneWindow | null {
  if (!zoneWindow || zoneCount <= 1) {
    return null;
  }

  const requestedTotal = toInt(zoneWindow.total);
  const requestedBefore = toInt(zoneWindow.before);
  const requestedAfter = toInt(zoneWindow.after);

  let total =
    typeof requestedTotal !== 'undefined'
      ? Math.max(1, requestedTotal)
      : typeof requestedBefore !== 'undefined' || typeof requestedAfter !== 'undefined'
      ? Math.max(1, Math.max(0, requestedBefore || 0) + Math.max(0, requestedAfter || 0) + 1)
      : 9;
  let before = typeof requestedBefore !== 'undefined' ? Math.max(0, requestedBefore) : undefined;
  let after = typeof requestedAfter !== 'undefined' ? Math.max(0, requestedAfter) : undefined;

  if (typeof before === 'undefined' && typeof after === 'undefined') {
    before = Math.floor((total - 1) / 2);
    after = total - before - 1;
  } else if (typeof before === 'undefined') {
    before = Math.max(0, total - (after || 0) - 1);
  } else if (typeof after === 'undefined') {
    after = Math.max(0, total - before - 1);
  }

  const expectedTotal = before + after + 1;
  if (expectedTotal !== total) {
    total = expectedTotal;
  }

  total = Math.max(1, Math.min(zoneCount, total));
  before = Math.min(before, total - 1);
  after = total - before - 1;

  return { total, before, after };
}

function getZoneBounds(world: World): ZoneBounds[] {
  const bounds: ZoneBounds[] = [];
  for (let i = 0; i < world.zones.length; i++) {
    const zone = world.zones[i];
    zone.recalculateBounds();
    if (zone.points[0] === 0) {
      continue;
    }
    bounds.push({
      zone,
      minX: zone.points[1],
      minY: zone.points[2],
      maxX: zone.points[3],
      maxY: zone.points[4],
    });
  }
  bounds.sort((a, b) => {
    if (a.minY !== b.minY) {
      return a.minY - b.minY;
    }
    if (a.minX !== b.minX) {
      return a.minX - b.minX;
    }
    return (a.zone?.id || '').localeCompare(b.zone?.id || '');
  });
  return bounds;
}

function getWindowedZoneBounds(world: World, options: NavigatorWorldRegionOptions): ZoneBounds[] | null {
  const resolvedWindow = resolveZoneWindow(options.zoneWindow, world.zones.length);
  if (!resolvedWindow) {
    return null;
  }

  const bounds = getZoneBounds(world);
  if (bounds.length <= resolvedWindow.total) {
    return bounds;
  }

  const anchorIndex = getAnchorZoneIndex(bounds, options.target);
  let start = anchorIndex - resolvedWindow.before;
  let end = start + resolvedWindow.total - 1;

  if (start < 0) {
    start = 0;
    end = resolvedWindow.total - 1;
  }

  if (end >= bounds.length) {
    end = bounds.length - 1;
    start = Math.max(0, end - resolvedWindow.total + 1);
  }

  return bounds.slice(start, end + 1);
}

function getViewportCenter(target: NavigatorWorldRegionOptions['target']): { x: number; y: number } | null {
  if (!target) {
    return null;
  }
  if (Array.isArray(target) || ArrayBuffer.isView(target)) {
    const strand = target as Strand;
    if (strand[0] === 0) {
      return null;
    }
    return {
      x: (strand[1] + strand[3]) / 2,
      y: (strand[2] + strand[4]) / 2,
    };
  }
  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
}

function getAnchorZoneIndex(zoneBounds: ZoneBounds[], target: NavigatorWorldRegionOptions['target']): number {
  if (zoneBounds.length === 0) {
    return 0;
  }

  const center = getViewportCenter(target);
  if (!center) {
    return 0;
  }

  for (let i = 0; i < zoneBounds.length; i++) {
    const zone = zoneBounds[i];
    if (center.x >= zone.minX && center.x <= zone.maxX && center.y >= zone.minY && center.y <= zone.maxY) {
      return i;
    }
  }

  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < zoneBounds.length; i++) {
    const zone = zoneBounds[i];
    const zoneCenterY = (zone.minY + zone.maxY) / 2;
    const distance = Math.abs(center.y - zoneCenterY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  return closestIndex;
}

function toRegion(zoneBounds: ZoneBounds[]): NavigatorWorldRegion | null {
  if (zoneBounds.length === 0) {
    return null;
  }

  let minX = zoneBounds[0].minX;
  let minY = zoneBounds[0].minY;
  let maxX = zoneBounds[0].maxX;
  let maxY = zoneBounds[0].maxY;

  for (let i = 1; i < zoneBounds.length; i++) {
    const zone = zoneBounds[i];
    minX = Math.min(minX, zone.minX);
    minY = Math.min(minY, zone.minY);
    maxX = Math.max(maxX, zone.maxX);
    maxY = Math.max(maxY, zone.maxY);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function getNavigatorWorldTransform(
  worldWidth: number,
  worldHeight: number,
  navigatorWidth: number,
  navigatorHeight: number,
  worldX = 0,
  worldY = 0
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
    worldX,
    worldY,
    worldWidth: safeWorldWidth,
    worldHeight: safeWorldHeight,
  };
}

export function getNavigatorWorldRegion(world: World, options: NavigatorWorldRegionOptions = {}): NavigatorWorldRegion {
  const activeZone = world.getActiveZone();
  if (activeZone) {
    activeZone.recalculateBounds();
    if (activeZone.points[0] !== 0) {
      return {
        x: activeZone.points[1],
        y: activeZone.points[2],
        width: Math.max(1, activeZone.points[3] - activeZone.points[1]),
        height: Math.max(1, activeZone.points[4] - activeZone.points[2]),
      };
    }
  }

  const windowedBounds = getWindowedZoneBounds(world, options);
  if (windowedBounds && windowedBounds.length > 0) {
    const region = toRegion(windowedBounds);
    if (region) {
      return region;
    }
  }

  return {
    x: 0,
    y: 0,
    width: Math.max(1, world.width),
    height: Math.max(1, world.height),
  };
}

export function getNavigatorVisibleZoneIdSet(
  world: World,
  options: NavigatorWorldRegionOptions = {}
): Set<string> | null {
  const activeZone = world.getActiveZone();
  if (activeZone) {
    activeZone.recalculateBounds();
    if (activeZone.points[0] !== 0) {
      return new Set([activeZone.id]);
    }
    return new Set();
  }

  const windowedBounds = getWindowedZoneBounds(world, options);
  if (!windowedBounds) {
    return null;
  }

  const visibleZoneIds = new Set<string>();
  for (const bounds of windowedBounds) {
    visibleZoneIds.add(bounds.zone.id);
  }
  return visibleZoneIds;
}

export function navigatorToWorldPoint(transform: NavigatorTransform, x: number, y: number): { x: number; y: number } {
  if (!transform.scale || !Number.isFinite(transform.scale)) {
    return { x: transform.worldX, y: transform.worldY };
  }

  const worldX = transform.worldX + (x - transform.offsetX) / transform.scale;
  const worldY = transform.worldY + (y - transform.offsetY) / transform.scale;

  return {
    x: Math.max(transform.worldX, Math.min(transform.worldX + transform.worldWidth, worldX)),
    y: Math.max(transform.worldY, Math.min(transform.worldY + transform.worldHeight, worldY)),
  };
}

export class NavigatorRenderer extends DebugRenderer {
  private readonly style: NavigatorRendererStyle;
  private readonly maxRects: number;
  private readonly minVisibleRectSize: number;
  private readonly drawFallbackBoxes: boolean;
  private readonly zoneWindow?: NavigatorZoneWindowOptions;
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
  private lastRegionX = Number.NaN;
  private lastRegionY = Number.NaN;
  private lastRegionWidth = Number.NaN;
  private lastRegionHeight = Number.NaN;

  constructor(canvas: HTMLCanvasElement, options: NavigatorRendererOptions = {}) {
    super(canvas);
    this.style = { ...DEFAULT_STYLE, ...(options.style || {}) };
    this.maxRects = Math.max(100, options.maxRects || 5000);
    this.minVisibleRectSize = Math.max(1, options.minVisibleRectSize || 1);
    this.drawFallbackBoxes = options.drawFallbackBoxes !== false;
    this.zoneWindow = options.zoneWindow;
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

    const region = getNavigatorWorldRegion(world, {
      target,
      zoneWindow: this.zoneWindow,
    });
    const regionChanged = this.hasRegionChanged(region);
    if (regionChanged) {
      this.worldLayerDirty = true;
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
      this.renderWorldLayer(world, region);
      this.worldLayerDirty = false;
    }

    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.baseCanvas, 0, 0);
    this.renderViewportBox(target, region);

    this.lastTargetX = target[1];
    this.lastTargetY = target[2];
    this.lastTargetX2 = target[3];
    this.lastTargetY2 = target[4];
    this.lastRegionX = region.x;
    this.lastRegionY = region.y;
    this.lastRegionWidth = region.width;
    this.lastRegionHeight = region.height;
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

  private hasRegionChanged(region: NavigatorWorldRegion) {
    return (
      this.lastRegionX !== region.x ||
      this.lastRegionY !== region.y ||
      this.lastRegionWidth !== region.width ||
      this.lastRegionHeight !== region.height
    );
  }

  private syncBaseLayerCanvas() {
    this.baseCanvas.width = this.canvas.width;
    this.baseCanvas.height = this.canvas.height;
  }

  private renderWorldLayer(world: World, region: NavigatorWorldRegion) {
    const ctx = this.baseContext;
    ctx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    ctx.fillStyle = this.style.background;
    ctx.fillRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);

    const activeZone = world.getActiveZone();
    const navigatorTransform = getNavigatorWorldTransform(
      region.width,
      region.height,
      this.baseCanvas.width,
      this.baseCanvas.height,
      region.x,
      region.y
    );

    this.worldTarget[1] = region.x;
    this.worldTarget[2] = region.y;
    this.worldTarget[3] = region.x + region.width;
    this.worldTarget[4] = region.y + region.height;

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
        if (activeZone) {
          const owner = (paint as any)?.__owner?.value;
          if (!owner || activeZone.objects.indexOf(owner) === -1) {
            continue;
          }
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

  private renderViewportBox(target: Strand, region: NavigatorWorldRegion) {
    const transform = getNavigatorWorldTransform(
      region.width,
      region.height,
      this.canvas.width,
      this.canvas.height,
      region.x,
      region.y
    );

    const x = (target[1] - transform.worldX) * transform.scale + transform.offsetX;
    const y = (target[2] - transform.worldY) * transform.scale + transform.offsetY;
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
