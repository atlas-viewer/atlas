import type { Strand } from '@atlas-viewer/dna';
import { TileCanvasCache } from './tile-canvas-cache';
import { Box } from '../../objects/box';
import { Geometry } from '../../objects/geometry';
import { TextLabelObject } from '../../objects/text-label';
import type { Text } from '../../objects/text';
import type { Renderer } from '../../renderer/renderer';
import { SingleImage } from '../../spacial-content/single-image';
import type { SpacialContent } from '../../spacial-content/spacial-content';
import { TiledImage } from '../../spacial-content/tiled-image';
import { isWarpedImage } from '../../spacial-content/warped-image';
import type { WarpMeshTile } from '../maps/warped/mesh';
import type { HookOptions } from '../../standalone';
import type { PositionPair } from '../../types';
import { getZoneConstrainedBounds } from '../../utility/get-zone-constrained-bounds';
import { distance } from '../../utils';
import type { World } from '../../world';
import type { Paint, Paintable, WorldObject } from '../../world-objects';
import { buildCssFilter } from '../shared/build-css-filter';
import type { AtlasImageLoadErrorEvent } from '../shared/image-load-events';
import { getRetryDelayMs, type ImageLoadingConfig, resolveImageLoadingConfig } from '../shared/image-loading-config';
import { ImageRequestPool, isImageRequestCancelledError } from '../shared/image-request-pool';
import type { AtlasReadyResetReason } from '../shared/ready-events';

const shadowRegex =
  /(-?[0-9]+(px|em)\s+|0\s+)(-?[0-9]+(px|em)\s+|0\s+)(-?[0-9]+(px|em)\s+|0\s+)?(-?[0-9]+(px|em)\s+|0\s+)?(.*)/g;
const shadowRegexCache: any = {};
const isFirefox =
  typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('firefox');

export type CanvasRendererOptions = {
  beforeFrame?: (delta: number) => void;
  debug?: boolean;
  htmlContainer?: HTMLDivElement;
  crossOrigin?: boolean;
  dpi?: number;
  box?: boolean;
  polygon?: boolean;
  lruCache?: boolean;
  paintImages?: boolean;
  shouldPaintImage?: (paint: SingleImage | TiledImage, index: number) => boolean;
  readiness?: 'first-meaningful-paint' | 'immediate';
  imageLoading?: Partial<ImageLoadingConfig>;
  onImageError?: (event: AtlasImageLoadErrorEvent) => void;
};

export type ImageBuffer = {
  canvas?: HTMLCanvasElement;
  canvases: string[];
  tiles?: Record<number, TileLoadingState>;
  indices: number[];
  loaded: number[];
  fallback?: ImageBuffer;
  loading: boolean;
};

const MAX_WAIT_FOR_MEANINGFUL_PAINT_MS = 500;

export type TileLoadingState = {
  state: 'idle' | 'queued' | 'loading' | 'decoded' | 'error';
  requestedAt?: number;
  loadedAt?: number;
  fadeStartedAt?: number;
  lastUsedAt?: number;
  url?: string;
  error?: unknown;
  attempts?: number;
  nextRetryAt?: number;
  lastRequestKey?: string;
  cancelledAt?: number;
  skipFade?: boolean;
};

type QueueTask = {
  id: string;
  scale: number;
  kind: 'network' | 'decode';
  tileKey?: string;
  requestKey?: string;
  network?: boolean;
  distance: number;
  shifted?: boolean;
  paint?: SingleImage | TiledImage;
  index?: number;
  prefetch?: boolean;
  task: () => Promise<any>;
};

type InFlightTileLoad = {
  tileKey: string;
  requestKey: string;
  url: string;
  consumerId: string;
  paint: SingleImage | TiledImage;
  imageBuffer: ImageBuffer;
  index: number;
  release: (opts?: { silent?: boolean }) => void;
};

export type ImageStretchDebugEvent = {
  /** The URL requested for this tile/image, as returned by paint.getImageUrl(index). */
  url: string;
  /** The loaded HTMLImageElement's actual intrinsic pixel dimensions. */
  naturalWidth: number;
  naturalHeight: number;
  /** The tile's target canvas dimensions -- what drawImage stretches/squashes the loaded image into. */
  targetWidth: number;
  targetHeight: number;
  /**
   * The tile's position (paint.display.points[index]'s x1/y1), in the same
   * local coordinate space as the owning SingleImage/TiledImage's own
   * width/height -- e.g. what a debug overlay would use to place a label
   * directly over this specific tile.
   */
  x: number;
  y: number;
  /** paint.id -- identifies which SpacialContent (SingleImage/TiledImage) this tile belongs to. */
  paintId: string;
  /** Index into paint.display.points -- which specific tile, for a TiledImage's grid (always 0 for a SingleImage). */
  index: number;
  /** True if the source and target aspect ratios differ beyond isImageStretched's tolerance -- the drawn image will look visibly non-uniformly scaled, not just soft/blurry. */
  stretched: boolean;
  /**
   * Whether paint is currently in this.visible -- the same list the
   * renderer itself consults for painting decisions. A tile can finish
   * loading and get drawn (firing this event) well after it's scrolled or
   * zoomed off screen; this lets debug tooling tell a currently-relevant
   * distortion apart from a stale one nobody will ever see.
   */
  isVisible: boolean;
};

export type TileLoadDebugEvent = {
  /** paint.id -- identifies which SpacialContent (SingleImage/TiledImage) this tile belongs to. */
  paintId: string;
  /** Index into paint.display.points -- which specific tile, for a TiledImage's grid (always 0 for a SingleImage). */
  index: number;
  /** paint.display.scale -- the tile's pyramid scale factor (1 = native resolution). */
  scale: number;
  /** The URL requested for this tile, as returned by paint.getImageUrl(index). */
  url: string;
  /**
   * 'requested' fires when the network fetch actually starts
   * (schedulePaintToCanvas's queued task running, not just being enqueued).
   * 'loaded' fires once the image has decoded and been drawn into its
   * tile's canvas. 'failed' fires once schedulePaintToCanvas's own retry
   * policy (imageLoadingConfig.maxAttempts) has given up for good -- not on
   * every individual failed attempt, only the terminal one.
   */
  status: 'requested' | 'loaded' | 'failed';
};

/**
 * Pure aspect-ratio comparison backing the debugImageStretch hook below --
 * exported so tests can call it directly without going through image
 * loading. Compares aspect ratios, not raw dimensions: drawImage(image, 0,
 * 0, targetWidth, targetHeight) always scales uniformly if the source and
 * target share an aspect ratio, even when the absolute pixel counts differ
 * (e.g. a server returning 1023px for a requested 1024px, common off-by-one
 * rounding) -- that's just a slightly softer/sharper image, not distortion.
 * Only a genuine aspect-ratio mismatch produces visible stretching/squashing
 * (non-uniform scaling), which is what this flags.
 */
export function isImageStretched(
  naturalWidth: number,
  naturalHeight: number,
  targetWidth: number,
  targetHeight: number,
  tolerance = 0.01
): boolean {
  if (!naturalWidth || !naturalHeight || !targetWidth || !targetHeight) {
    return false;
  }
  const sourceRatio = naturalWidth / naturalHeight;
  const targetRatio = targetWidth / targetHeight;
  return Math.abs(sourceRatio - targetRatio) / sourceRatio > tolerance;
}

/**
 * Whether a drawImage() call from sourceWidth/Height into
 * targetWidth/Height is actually resizing the image, as opposed to a ~1:1
 * blit. Backs the imageSmoothingEnabled toggle in paint(): a rotated world
 * still passes fractional (sub-pixel) coordinates into drawImage even at a
 * clean 90deg angle, since the rotation pivot and destination x/y come
 * from continuous pan/zoom/rotate math rather than integer device pixels.
 * With smoothing always on, that sub-pixel misalignment gets bilinearly
 * resampled and visibly softens tiles that are already at native
 * resolution. Genuinely up/downscaled tiles still want smoothing to avoid
 * a blocky look, so this only reports true once the size actually differs
 * by more than a device-pixel's worth of rounding slop.
 */
export function needsSmoothing(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  tolerance = 1
): boolean {
  return Math.abs(sourceWidth - targetWidth) > tolerance || Math.abs(sourceHeight - targetHeight) > tolerance;
}

export class CanvasRenderer implements Renderer {
  /**
   * Optional debug hook, set by tests/tooling, fired whenever a loaded tile
   * image is drawn into its target canvas (schedulePaintToCanvas). Exists
   * to make image-server aspect-ratio mismatches detectable: drawImage()
   * here always stretches the loaded image to exactly fill the tile's
   * target dimensions (computed from paint.display.points), with no check
   * that the image actually loaded at a compatible aspect ratio -- if an
   * image server returns something with a meaningfully different aspect
   * ratio than what was requested (wrong crop parameters, a
   * misconfigured/non-conformant IIIF service, etc.), the tile silently
   * renders visibly stretched or squashed. No-op unless a test/tool sets
   * it.
   */
  static debugImageStretch: ((event: ImageStretchDebugEvent) => void) | undefined;

  /**
   * Optional debug hook, set by tests/tooling, fired at each stage of a
   * tile's network fetch: 'requested' when the fetch actually starts,
   * 'loaded' once the image has decoded, 'failed' once loadImage has
   * given up for good. Exists to make stuck/failed tile loads visible --
   * normally a failed or endlessly-pending fetch has no on-screen signal
   * at all, it just leaves whatever lower-resolution tile was already
   * drawn there in place indefinitely. No-op unless a test/tool sets it.
   */
  static debugTileLoad: ((event: TileLoadDebugEvent) => void) | undefined;

  /**
   * The primary viewing space for the viewer.
   */
  canvas: HTMLCanvasElement;

  /**
   * Canvas context for `this.canvas`
   */
  ctx: CanvasRenderingContext2D;
  private warpCompositeCanvas?: HTMLCanvasElement;
  private warpCompositeContext?: CanvasRenderingContext2D;
  private warpCompositeAlpha = 1;
  private warpCompositeGroup?: SpacialContent;
  private warpCompositePending = false;

  /**
   * Rendering options added in the constructor.
   */
  options: CanvasRendererOptions;

  /**
   * Number of images loading.
   */
  imagesPending = 0;

  /**
   * Number of completed images, used to calculate pending images.
   */
  imagesLoaded = 0;

  /**
   * The ids of the completed images, use to dedupe
   */
  imageIdsLoaded: string[] = [];

  /**
   * Can be used to avoid or stop work when frame is or isn't rendering outside of the main loop.
   */
  frameIsRendering = false;
  pendingDrawCall = false;
  firstMeaningfulPaint = false;
  parallelTasks = 6;
  maxPrefetchPerFrame = 8;
  imageLoadingConfig: ImageLoadingConfig;
  imageRequestPool: ImageRequestPool;
  frameTasks = 0;
  loadingQueueOrdered = true;
  loadingQueue: QueueTask[] = [];
  currentTask: Promise<any> = Promise.resolve();
  tasksRunning = 0;
  inFlightImageLoads = new Map<string, InFlightTileLoad>();
  requiredTileKeys = new Set<string>();
  requiredPrefetchTileKeys = new Set<string>();
  requestGeneration = 0;
  private resetGeneration = 0;
  private idle = false;
  private imageBuffers = new Set<ImageBuffer>();
  frameCounter = 0;
  pendingTileReveals = new Map<
    string,
    {
      imageBuffer: ImageBuffer;
      index: number;
      queuedFrame: number;
    }
  >();
  stats?: any;
  averageJobTime = 64; // ms
  lastKnownScale = 1;
  visible: Array<SpacialContent> = [];
  previousVisible: Array<SpacialContent> = [];
  rendererPosition: DOMRect;
  dpi: number;
  drawCalls: Array<() => void> = [];
  lastPaintedObject?: WorldObject;
  hostCache: TileCanvasCache | Map<string, HTMLCanvasElement>;
  private frameCanvasKeys = new Set<string>();
  invalidated: string[] = [];
  fallbackRevealTimeout: ReturnType<typeof setTimeout> | null = null;
  framePrefetchCount = 0;
  hasTilesFading = false;
  hasActiveLayerClip = false;

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;
    this.rendererPosition = canvas.getBoundingClientRect();
    // Not working as expected.
    // this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
    this.ctx = canvas.getContext('2d', {
      alpha: true,
    }) as CanvasRenderingContext2D;
    if (!this.ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx.imageSmoothingEnabled = true;
    this.options = options || {};
    this.imageLoadingConfig = resolveImageLoadingConfig(this.options.imageLoading);
    this.parallelTasks = this.imageLoadingConfig.maxConcurrentRequests;
    this.maxPrefetchPerFrame = this.imageLoadingConfig.maxPrefetchPerFrame;
    this.imageRequestPool = new ImageRequestPool({
      timeoutMs: this.imageLoadingConfig.timeoutMs,
      crossOrigin: this.options.crossOrigin ? 'anonymous' : undefined,
      useFetch: !!this.options.crossOrigin,
      // Tiles are retained in hostCache; do not also retain their source images.
      cache: false,
    });
    // Testing fade in.
    // this.canvas.style.opacity = '0';
    this.canvas.style.transition = 'opacity .3s';
    this.dpi = options?.dpi || 1;
    if (this.options.readiness === 'immediate') {
      this.firstMeaningfulPaint = true;
      this.canvas.style.opacity = '1';
    }

    this.hostCache = options?.lruCache !== false ? new TileCanvasCache() : new Map<string, HTMLCanvasElement>();

    // if (process.env.NODE_ENV !== 'production' && this.options.debug) {
    //   import('stats.js')
    //     .then((s) => new s.default())
    //     .then((stats) => {
    //       this.stats = stats;
    //       this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    //       if (document && document.body) {
    //         document.body.appendChild(this.stats.dom);
    //       }
    //     });
    // }
  }

  getCanvasDims() {
    return {
      width: this.canvas.width / this.dpi,
      height: this.canvas.height / this.dpi,
    };
  }

  resize() {
    this.rendererPosition = this.canvas.getBoundingClientRect();
  }

  private getCompositeOwner(paint?: SingleImage | TiledImage): unknown {
    const parent = paint?.__parent as any;
    return parent && parent.renderOptions ? parent : undefined;
  }

  private compareCompositeLoadPriority(aPaint?: SingleImage | TiledImage, bPaint?: SingleImage | TiledImage): number {
    const aOwner = this.getCompositeOwner(aPaint);
    const bOwner = this.getCompositeOwner(bPaint);
    if (!aOwner || aOwner !== bOwner) {
      return 0;
    }

    const aScale = aPaint?.display.scale || 0;
    const bScale = bPaint?.display.scale || 0;
    return aScale - bScale;
  }

  isReady(): boolean {
    return this.firstMeaningfulPaint;
  }

  preloadImages(urls: readonly string[], options?: { signal?: AbortSignal }) {
    return this.imageRequestPool.preload(urls, options);
  }

  private imageCacheKey(paint: SingleImage | TiledImage, index: number) {
    const p = paint.display.points;
    return `${paint.getImageUrl(index)}::${p[index * 5 + 3] - p[index * 5 + 1]}x${p[index * 5 + 4] - p[index * 5 + 2]}`;
  }

  private restoreCachedTile(buffer: ImageBuffer, paint: SingleImage | TiledImage, index: number) {
    const key = this.imageCacheKey(paint, index);
    const url = paint.getImageUrl(index);
    if (buffer.canvases[index] && (!buffer.tiles?.[index]?.url || buffer.tiles[index].url === url)) return;
    buffer.canvases[index] = key;
    let canvas = this.hostCache.get(key);
    const image = !canvas && this.imageRequestPool.getCachedImage(paint.getImageUrl(index));
    if (image) {
      const p = paint.display.points;
      canvas = document.createElement('canvas');
      canvas.width = p[index * 5 + 3] - p[index * 5 + 1];
      canvas.height = p[index * 5 + 4] - p[index * 5 + 2];
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      this.hostCache.set(key, canvas);
    }
    this.setTileState(
      buffer,
      index,
      canvas && canvas.width && canvas.height
        ? { state: 'decoded', loadedAt: performance.now(), skipFade: true, url }
        : { state: 'idle', url }
    );
  }

  private viewTransformSaved = false;
  private presentationContext?: CanvasRenderingContext2D;
  private stagingCanvas?: HTMLCanvasElement;
  private stagedFrom = new Map<SpacialContent, string | undefined>();
  private stagedSceneChanged = false;
  private waitForSceneChange = false;

  afterFrame(world: World): void {
    this.flushWarpComposite();
    // this.lastPaintedObject = paint.__owner.value;
    this.clearTransform();
    this.lastPaintedObject = undefined;
    if (this.viewTransformSaved) {
      this.ctx.restore();
      this.viewTransformSaved = false;
    }
    // this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    // this.ctx.rotate((90 * Math.PI) / 180);
    // this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);
    this.frameIsRendering = false;
    if (this.stagingCanvas && !this.stagedSceneChanged) {
      this.stagedSceneChanged = this.visible.some(
        (paint) =>
          !this.stagedFrom.has(paint) ||
          this.stagedFrom.get(paint) !== (paint as SingleImage | TiledImage).getImageUrl?.(0)
      );
    }
    if (this.stagingCanvas && this.presentationContext && this.firstMeaningfulPaint && this.visible.length) {
      const context = this.presentationContext;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.filter = 'none';
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      context.drawImage(this.stagingCanvas, 0, 0);
      context.restore();
      this.ctx = context;
      this.presentationContext = undefined;
      this.stagingCanvas.width = this.stagingCanvas.height = 0;
      this.stagingCanvas = undefined;
      this.stagedFrom.clear();
    }
    this.imagesPending =
      this.loadingQueue.length + this.tasksRunning + this.inFlightImageLoads.size + this.pendingTileReveals.size;
    this.imagesLoaded = 0;
    if (!this.loadingQueueOrdered /*&& this.loadingQueue.length > this.parallelTasks*/) {
      this.loadingQueue = this.loadingQueue.sort((a, b) => {
        const compositePriority = this.compareCompositeLoadPriority(a.paint, b.paint);
        if (compositePriority !== 0) {
          return compositePriority;
        }
        if (a.network && b.network && a.scale === b.scale) {
          return b.distance - a.distance;
        }
        return a.scale - b.scale;
      });
      this.loadingQueueOrdered = true;
    }
    if (this.hostCache instanceof TileCanvasCache) this.hostCache.finishFrame(this.frameCanvasKeys);
    this.scheduleSingleImageLookahead(world);
    // Set them.
    this.previousVisible = this.visible;
    this.pruneStaleTileWork();
    this.pendingDrawCall = !!this.drawCalls.length;
    if (this.pendingDrawCall) {
      const calls = this.drawCalls.splice(0);
      for (const draw of calls) draw();
    }
    // Some off-screen work might need done, like loading new images in.
    this.doOffscreenWork();
    // Stats
    if (this.options.debug && this.stats) {
      this.stats.end();
    }
  }

  doOffscreenWork() {
    if (this.idle) return;
    this.frameTasks = 0;
    // This is our worker. It is called every 1ms (roughly) and will usually be
    // an async task that can run without blocking the frame. Because of
    // there is a configuration for parallel task count.
    if (this.loadingQueue.length) {
      // First call immediately.
      this._worker();
      if (this.loadingQueue.length && this.tasksRunning < this.parallelTasks) {
        // Here's our clock for scheduling tasks, every 1ms it will try to call.
        if (!this._scheduled) {
          this._scheduled = setInterval(this._doWork, 0);
        }
      }
    }
  }

  _worker = () => {
    if (this.idle) return;
    if (
      // First we check if there is work to do.
      this.loadingQueue.length &&
      this.tasksRunning < this.parallelTasks &&
      this.frameTasks < this.parallelTasks
    ) {
      // Let's pop something off the loading queue.
      const next = this.loadingQueue.pop();

      if (next) {
        // @todo removed for now, while a nice optimisation it was breaking the "renderSmallestFallback"
        // const outOfBounds = !next.shifted && Math.abs(1 - next.scale / (1 / this.lastKnownScale)) >= 1;
        // if (outOfBounds && !next.shifted) {
        //   next.shifted = true;
        //   this.loadingQueue.unshift(next);
        //   return;
        // }
        // We will increment the task count
        this.tasksRunning++;
        this.frameTasks++;
        const generation = this.resetGeneration;
        // And kick it off. We don't care if it succeeded or not.
        // A task that needs to retry should just add a new task.
        this.currentTask = next
          .task()
          .then(() => {
            if (generation === this.resetGeneration) this.tasksRunning--;
          })
          .catch(() => {
            if (generation === this.resetGeneration) this.tasksRunning--;
          });
      }
    }
  };
  _scheduled: any = 0;
  _doWork = () => {
    // Here is the shut down, no more work to do.
    if (this.loadingQueue.length === 0 && this.tasksRunning === 0 && this._scheduled) {
      clearInterval(this._scheduled);
      this._scheduled = 0;
    }

    let parallel = this.parallelTasks || 1;

    if (!this.firstMeaningfulPaint && this.loadingQueue.length) {
      parallel = this.loadingQueue.length;
    }
    // And here's our working being called. Since JS is blocking, this will complete
    // before the next tick, so its possible that this could be more than 1ms.
    for (let i = 0; i < parallel; i++) {
      this._worker();
    }
  };

  getScale(width: number, height: number, dpi?: boolean): number {
    // It shouldn't happen, but it will. If the canvas is a different shape
    // to the viewport, then this will choose the largest scale to use.
    if (Number.isNaN(width) || Number.isNaN(height)) {
      return this.lastKnownScale;
    }

    const canvas = this.getCanvasDims();
    const w = canvas.width / width;
    const h = canvas.height / height;
    const scale = (w < h ? h : w) * (dpi ? this.dpi || 1 : 1);

    if (!Number.isNaN(scale)) {
      this.lastKnownScale = scale;
    }

    return this.lastKnownScale;
  }

  beforeFrame(world: World, delta: number, target: Strand, options: HookOptions): void {
    // const scale = this.getScale(target[3] - target[1], target[4] - target[1]);
    // this.ctx.setTransform(scale, 0, 0, scale, -target[1], -target[2]);

    if (this.options.debug && this.stats) {
      this.stats.begin();
    }
    if (this.stagingCanvas) {
      if (this.stagingCanvas.width !== this.canvas.width) this.stagingCanvas.width = this.canvas.width;
      if (this.stagingCanvas.height !== this.canvas.height) this.stagingCanvas.height = this.canvas.height;
    }
    this.frameIsRendering = true;
    this.frameCounter += 1;
    this.visible = [];
    this.framePrefetchCount = 0;
    this.frameCanvasKeys.clear();
    this.hasTilesFading = false;
    this.requiredTileKeys.clear();
    this.requiredPrefetchTileKeys.clear();
    this.flushTileRevealBatch();
    // User-facing hook for before frame, contains timing information for
    // animations that might be happening, such as pan/drag.
    if (this.options.beforeFrame) {
      this.options.beforeFrame(delta);
    }

    const canvas = this.getCanvasDims();
    // But we also need to clear the canvas.
    this.ctx.globalAlpha = 1;
    if (this.canvas.dataset.background === 'transparent') {
      this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      this.ctx.fillStyle = this.canvas.dataset.background ?? 'rgb(0, 0, 0)';
      this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    // this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    // this.ctx.rotate((-90 * Math.PI) / 180);
    // this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);

    if (options.viewRotation && options.viewCenter) {
      this.ctx.save();
      this.viewTransformSaved = true;
      this.ctx.translate(options.viewCenter.x, options.viewCenter.y);
      this.ctx.rotate((options.viewRotation * Math.PI) / 180);
      this.ctx.translate(-options.viewCenter.x, -options.viewCenter.y);
    }
    const filter = buildCssFilter(options);
    if (this.ctx.filter !== filter) {
      this.ctx.filter = filter;
    }
  }

  applyTransform(paint: Paintable, x: number, y: number, width: number, height: number) {
    const owner = paint.__owner.value;
    if (owner && owner.rotation) {
      this.ctx.save();
      // x,y are the top left point of the box, not the center of the viewport
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const angle = (owner.rotation * Math.PI) / 180;
      const moveX = x + halfWidth;
      const moveY = y + halfHeight;
      this.ctx.translate(moveX, moveY);
      this.ctx.rotate(angle);
      this.ctx.translate(-moveX, -moveY);
      this.lastPaintedObject = owner;
    }
  }
  clearTransform() {
    // Do something with last object.
    if (this.lastPaintedObject) {
      if (this.lastPaintedObject.rotation) {
        this.ctx.restore();
      }
      this.lastPaintedObject = undefined;
    }
  }

  private getTileKey(paint: SingleImage | TiledImage, index: number): string {
    return `${paint.id}::${paint.display.scale}::${index}`;
  }

  private nextRequestKey(tileKey: string): string {
    this.requestGeneration += 1;
    return `${tileKey}::${this.requestGeneration}`;
  }

  private markTileRequired(tileKey: string, prefetch: boolean) {
    if (prefetch) {
      this.requiredPrefetchTileKeys.add(tileKey);
      return;
    }
    this.requiredTileKeys.add(tileKey);
  }

  private isTileRequired(tileKey: string): boolean {
    return this.requiredTileKeys.has(tileKey) || this.requiredPrefetchTileKeys.has(tileKey);
  }

  private shouldSkipFade(tileState: TileLoadingState | undefined, now = performance.now()): boolean {
    if (!tileState?.requestedAt) {
      return false;
    }
    return now - tileState.requestedAt <= this.imageLoadingConfig.skipFadeIfLoadedWithinMs;
  }

  private enqueueTileReveal(tileKey: string, imageBuffer: ImageBuffer, index: number) {
    const now = performance.now();
    if (this.imageLoadingConfig.revealDelayFrames === 0 && this.imageLoadingConfig.revealBatchWindowFrames === 0) {
      const state = this.getTileState(imageBuffer, index);
      this.setTileState(imageBuffer, index, {
        ...state,
        loadedAt: now,
        skipFade: this.shouldSkipFade(state, now),
      });
      return;
    }

    this.pendingTileReveals.set(tileKey, {
      imageBuffer,
      index,
      queuedFrame: this.frameCounter,
    });
  }

  private flushTileRevealBatch() {
    if (this.pendingTileReveals.size === 0) {
      return;
    }

    const delay = this.imageLoadingConfig.revealDelayFrames;
    const windowFrames = this.imageLoadingConfig.revealBatchWindowFrames;
    const now = performance.now();

    const entries = [...this.pendingTileReveals.entries()].sort((a, b) => a[1].queuedFrame - b[1].queuedFrame);
    let cursor = 0;

    while (cursor < entries.length) {
      const first = entries[cursor];
      if (this.frameCounter - first[1].queuedFrame < delay) {
        break;
      }

      const cutoffFrame = first[1].queuedFrame + windowFrames;
      while (cursor < entries.length && entries[cursor][1].queuedFrame <= cutoffFrame) {
        const [tileKey, pending] = entries[cursor];
        const state = this.getTileState(pending.imageBuffer, pending.index);
        if (state.state === 'decoded' && !state.loadedAt) {
          this.setTileState(pending.imageBuffer, pending.index, {
            ...state,
            loadedAt: now,
            skipFade: this.shouldSkipFade(state, now),
          });
        }
        this.pendingTileReveals.delete(tileKey);
        cursor += 1;
      }
    }
  }

  private emitImageError(event: Omit<AtlasImageLoadErrorEvent, 'renderer'>) {
    if (this.options.onImageError) {
      this.options.onImageError({
        renderer: 'canvas',
        ...event,
      });
    }
  }

  private releaseInFlightTileLoad(tileKey: string, opts: { silent?: boolean } = {}) {
    const inFlight = this.inFlightImageLoads.get(tileKey);
    if (!inFlight) {
      return;
    }

    inFlight.release(opts);
    this.inFlightImageLoads.delete(tileKey);
  }

  private pruneStaleTileWork() {
    const nextQueue: QueueTask[] = [];
    for (const task of this.loadingQueue) {
      if (!task.tileKey || this.isTileRequired(task.tileKey)) {
        nextQueue.push(task);
        continue;
      }

      if (task.paint && typeof task.index === 'number') {
        const imageBuffer = this.ensureImageBuffer(task.paint);
        const state = this.getTileState(imageBuffer, task.index);
        if (state.lastRequestKey === task.requestKey && (state.state === 'queued' || state.state === 'loading')) {
          this.setTileState(imageBuffer, task.index, {
            ...state,
            state: 'idle',
            cancelledAt: performance.now(),
          });
        }
      }
      if (task.tileKey) {
        this.pendingTileReveals.delete(task.tileKey);
      }
    }
    this.loadingQueue = nextQueue;

    const staleInFlight: string[] = [];
    for (const [tileKey, inFlight] of this.inFlightImageLoads.entries()) {
      if (this.isTileRequired(tileKey)) {
        continue;
      }
      staleInFlight.push(tileKey);
      const state = this.getTileState(inFlight.imageBuffer, inFlight.index);
      if (state.lastRequestKey === inFlight.requestKey && state.state === 'loading') {
        this.setTileState(inFlight.imageBuffer, inFlight.index, {
          ...state,
          state: 'idle',
          cancelledAt: performance.now(),
        });
      }
      this.pendingTileReveals.delete(tileKey);
    }

    for (const tileKey of staleInFlight) {
      this.releaseInFlightTileLoad(tileKey, { silent: true });
    }
  }

  private ensureImageBuffer(paint: SingleImage | TiledImage): ImageBuffer {
    if (!paint.__host || !paint.__host.canvas) {
      this.createImageHost(paint);
    }

    const imageBuffer = paint.__host.canvas as ImageBuffer;
    this.imageBuffers.add(imageBuffer);
    if (!imageBuffer.tiles) {
      imageBuffer.tiles = {};
    }
    if (!imageBuffer.indices) {
      imageBuffer.indices = [];
    }
    if (!imageBuffer.loaded) {
      imageBuffer.loaded = [];
    }
    if (!imageBuffer.canvases) {
      imageBuffer.canvases = [];
    }

    return imageBuffer;
  }

  private getTileState(imageBuffer: ImageBuffer, index: number): TileLoadingState {
    if (!imageBuffer.tiles) {
      imageBuffer.tiles = {};
    }
    if (!imageBuffer.tiles[index]) {
      imageBuffer.tiles[index] = { state: 'idle' };
      this.syncBufferState(imageBuffer);
    }
    return imageBuffer.tiles[index];
  }

  private setTileState(imageBuffer: ImageBuffer, index: number, state: TileLoadingState) {
    if (!imageBuffer.tiles) {
      imageBuffer.tiles = {};
    }
    imageBuffer.tiles[index] = state;
    this.syncBufferState(imageBuffer);
  }

  private syncBufferState(imageBuffer: ImageBuffer) {
    const indices: number[] = [];
    const loaded: number[] = [];
    const tiles = imageBuffer.tiles || {};
    const keys = Object.keys(tiles);
    for (let i = 0; i < keys.length; i++) {
      const index = parseInt(keys[i], 10);
      const state = tiles[index].state;
      if (state === 'queued' || state === 'loading') {
        indices.push(index);
      }
      if (state === 'decoded') {
        loaded.push(index);
      }
    }
    imageBuffer.indices = indices;
    imageBuffer.loaded = loaded;
    imageBuffer.loading = indices.length > 0;
  }

  private getCompositeRenderOptions(paint: SingleImage | TiledImage) {
    return paint.__parent?.renderOptions;
  }

  private shouldClipLayerToBounds(paint: SpacialContent): boolean {
    if (!(paint instanceof SingleImage || paint instanceof TiledImage)) {
      return false;
    }
    return !!this.getCompositeRenderOptions(paint)?.clipToBounds;
  }

  private getBoundsFromPoints(points: Strand): { x: number; y: number; width: number; height: number } | undefined {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < points.length; i += 5) {
      if (!points[i]) {
        continue;
      }
      minX = Math.min(minX, points[i + 1]);
      minY = Math.min(minY, points[i + 2]);
      maxX = Math.max(maxX, points[i + 3]);
      maxY = Math.max(maxY, points[i + 4]);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return undefined;
    }
    if (maxX <= minX || maxY <= minY) {
      return undefined;
    }
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private getLayerPolicy(paint: SingleImage | TiledImage) {
    return this.getCompositeRenderOptions(paint)?.layerPolicy || 'fallback-only';
  }

  private isLayerActive(paint: SingleImage | TiledImage): boolean {
    const parent = paint.__parent as any;
    if (!parent) {
      return true;
    }
    const policy = this.getLayerPolicy(paint);
    if (policy === 'always-blend') {
      return true;
    }
    if (typeof parent.isImageActive === 'function') {
      return !!parent.isImageActive(paint);
    }
    return true;
  }

  private getPrefetchRadius(paint: SingleImage | TiledImage): number {
    const options = this.getCompositeRenderOptions(paint);
    if (!options) {
      return 0;
    }
    if (typeof options.prefetchRadius === 'number') {
      return Math.max(0, options.prefetchRadius);
    }
    if (options.loadingBias === 'speed') {
      return 2;
    }
    if (options.loadingBias === 'data') {
      return 0;
    }
    return 1;
  }

  private getFadeAlpha(
    paint: SingleImage | TiledImage,
    tileState: TileLoadingState | undefined,
    isActiveLayer: boolean
  ): number {
    if (tileState?.skipFade) {
      return 1;
    }

    const isRevealDeferred =
      tileState?.state === 'decoded' &&
      !tileState.loadedAt &&
      (this.imageLoadingConfig.revealDelayFrames > 0 || this.imageLoadingConfig.revealBatchWindowFrames > 0);
    if (isRevealDeferred) {
      return 0;
    }

    const options = this.getCompositeRenderOptions(paint);
    if (!options || !options.fadeInMs || options.fadeInMs <= 0) {
      return 1;
    }

    const fadeMs = options.fadeInMs;
    const now = performance.now();
    let fadeAlpha = 1;

    if (isActiveLayer && options.fadeOnLayerChange && options.layerPolicy !== 'active-only') {
      const parent = paint.__parent as any;
      if (parent && typeof parent.getImageActivatedAt === 'function') {
        const activatedAt = parent.getImageActivatedAt(paint);
        if (typeof activatedAt === 'number') {
          fadeAlpha = Math.min(fadeAlpha, Math.max(0, Math.min(1, (now - activatedAt) / fadeMs)));
        }
      }
    }

    if (tileState?.loadedAt && (isActiveLayer || options.fadeFallbackTiles)) {
      if (!tileState.fadeStartedAt) {
        tileState.fadeStartedAt = now;
      }
      fadeAlpha = Math.min(fadeAlpha, Math.max(0, Math.min(1, (now - tileState.fadeStartedAt) / fadeMs)));
    }

    return fadeAlpha;
  }

  private schedulePrefetchNeighbours(
    imageBuffer: ImageBuffer,
    paint: SingleImage | TiledImage,
    index: number,
    priority: number
  ) {
    if (!(paint instanceof TiledImage)) {
      return;
    }
    if (this.framePrefetchCount >= this.maxPrefetchPerFrame) {
      return;
    }

    const options = this.getCompositeRenderOptions(paint);
    if (options?.loadingBias === 'data') {
      return;
    }

    const radius = this.getPrefetchRadius(paint);
    if (radius <= 0) {
      return;
    }

    const columns = paint.renderColumns;
    const rows = paint.renderRows;
    if (!columns || !rows) {
      return;
    }

    const x = index % columns;
    const y = Math.floor(index / columns);

    for (let distance = 1; distance <= radius; distance++) {
      for (let dy = -distance; dy <= distance; dy++) {
        for (let dx = -distance; dx <= distance; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) {
            continue;
          }

          const neighbourIndex = ny * columns + nx;
          const neighbourTileKey = this.getTileKey(paint, neighbourIndex);
          this.markTileRequired(neighbourTileKey, true);
          if (this.schedulePaintToCanvas(imageBuffer, paint, neighbourIndex, priority + distance * 1000, true)) {
            this.framePrefetchCount++;
            if (this.framePrefetchCount >= this.maxPrefetchPerFrame) {
              return;
            }
          }
        }
      }
    }
  }

  private scheduleSingleImageLookahead(world: World) {
    if (this.maxPrefetchPerFrame <= 0 || this.framePrefetchCount >= this.maxPrefetchPerFrame) {
      return;
    }
    if (world.hasActiveZone()) {
      return;
    }

    let viewportTop = Number.POSITIVE_INFINITY;
    let viewportBottom = Number.NEGATIVE_INFINITY;
    const visibleOwners = new Set<WorldObject>();
    for (let i = 0; i < this.visible.length; i++) {
      const owner = this.visible[i].__owner?.value;
      if (!owner || owner.type !== 'world-object' || owner.points[0] === 0) {
        continue;
      }
      visibleOwners.add(owner as WorldObject);
      viewportTop = Math.min(viewportTop, owner.points[2]);
      viewportBottom = Math.max(viewportBottom, owner.points[4]);
    }

    if (!Number.isFinite(viewportTop) || !Number.isFinite(viewportBottom)) {
      return;
    }
    const viewportHeight = viewportBottom - viewportTop;
    if (viewportHeight <= 0) {
      return;
    }

    const lookaheadDistance = viewportHeight * 1.5;
    const aheadLimit = viewportBottom + lookaheadDistance;
    const behindLimit = viewportTop - lookaheadDistance;

    let nearestAhead: { image: SingleImage; distance: number } | undefined;
    let nearestBehind: { image: SingleImage; distance: number } | undefined;

    const objects = world.getObjects() as Array<WorldObject | undefined>;
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      if (!object || object.type !== 'world-object' || object.points[0] === 0) {
        continue;
      }
      if (visibleOwners.has(object)) {
        continue;
      }

      const objectTop = object.points[2];
      const objectBottom = object.points[4];

      const isAhead = objectTop >= viewportBottom && objectTop <= aheadLimit;
      const isBehind = objectBottom <= viewportTop && objectBottom >= behindLimit;

      if (!isAhead && !isBehind) {
        continue;
      }

      let singleImageLayer: SingleImage | undefined;
      for (let j = 0; j < object.layers.length; j++) {
        const layer = object.layers[j];
        if (layer instanceof SingleImage) {
          singleImageLayer = layer;
          break;
        }
      }

      if (!singleImageLayer) {
        continue;
      }

      if (isAhead) {
        const distance = objectTop - viewportBottom;
        if (!nearestAhead || distance < nearestAhead.distance) {
          nearestAhead = { image: singleImageLayer, distance };
        }
      }
      if (isBehind) {
        const distance = viewportTop - objectBottom;
        if (!nearestBehind || distance < nearestBehind.distance) {
          nearestBehind = { image: singleImageLayer, distance };
        }
      }
    }

    const prefetchCandidates = [nearestAhead, nearestBehind].filter(Boolean) as Array<{
      image: SingleImage;
      distance: number;
    }>;

    for (const candidate of prefetchCandidates) {
      if (this.framePrefetchCount >= this.maxPrefetchPerFrame) {
        break;
      }
      const imageBuffer = this.ensureImageBuffer(candidate.image);
      if (this.schedulePaintToCanvas(imageBuffer, candidate.image, 0, 10000 + candidate.distance, true)) {
        this.framePrefetchCount++;
      }
    }
  }

  paint(paint: SpacialContent | Text | Box, index: number, x: number, y: number, width: number, height: number): void {
    const ga = this.ctx.globalAlpha;
    const zoneVisibilityAlpha =
      typeof (paint as any).__zoneVisibilityAlpha === 'number' ? (paint as any).__zoneVisibilityAlpha : 1;

    if (paint instanceof TextLabelObject) {
      this.ctx.save();
      this.ctx.globalAlpha *= zoneVisibilityAlpha;
      paint.draw(this.ctx, x, y, width, height, this.dpi);
      this.ctx.restore();
      return;
    }

    // Only supporting single and tiled images at the moment.
    if (paint instanceof SingleImage || paint instanceof TiledImage) {
      const rotation = paint.display.rotation || 0;
      const didRotate = rotation !== 0;

      try {
        if (didRotate) {
          this.ctx.save();
          let moveX = x + width / 2;
          let moveY = y + height / 2;
          if (paint.crop) {
            moveX -= paint.crop[index * 5 + 1];
            moveY -= paint.crop[index * 5 + 2];
          }
          this.ctx.translate(moveX, moveY);
          this.ctx.rotate((rotation * Math.PI) / 180);
          this.ctx.translate(-moveX, -moveY);
        }

        const shouldPaintImages = this.options.paintImages !== false;
        const shouldPaintImage = this.options.shouldPaintImage ? this.options.shouldPaintImage(paint, index) : true;
        if (!shouldPaintImages || !shouldPaintImage) {
          return;
        }

        this.visible.push(paint);

        const baseOpacity =
          (this.warpCompositeContext ? 1 : typeof paint.style?.opacity !== 'undefined' ? paint.style.opacity : 1) *
          zoneVisibilityAlpha;
        if (!baseOpacity) {
          return;
        }
        this.ctx.globalAlpha = ga * baseOpacity;

        const imageBuffer = this.ensureImageBuffer(paint);
        const canvasKey = this.imageCacheKey(paint, index);
        this.frameCanvasKeys.add(canvasKey);
        if (this.hostCache instanceof TileCanvasCache) this.hostCache.protect(canvasKey);
        this.restoreCachedTile(imageBuffer, paint, index);
        const tileState = this.getTileState(imageBuffer, index);
        tileState.lastUsedAt = performance.now();
        this.setTileState(imageBuffer, index, tileState);
        const tileKey = this.getTileKey(paint, index);
        this.markTileRequired(tileKey, false);

        const isActiveLayer = this.isLayerActive(paint);
        const canvas = this.getCanvasDims();
        const priority = distance(
          { x: x + width / 2, y: y + height / 2 },
          { x: canvas.width / 2, y: canvas.height / 2 }
        );
        const canvasToPaint = this.hostCache.get(imageBuffer.canvases[index]);
        const hasImage = !!canvasToPaint;
        // Cache entries are shared by URL. Their presence, not a stale eviction key,
        // determines validity after another scene has repopulated the same URL.
        const isInvalidated = !hasImage && tileState.state === 'decoded';

        if (isInvalidated) {
          this.setTileState(imageBuffer, index, {
            ...tileState,
            state: 'idle',
          });
        }

        if (
          (isInvalidated || !hasImage || tileState.state === 'idle' || tileState.state === 'error') &&
          isActiveLayer
        ) {
          this.schedulePaintToCanvas(imageBuffer, paint, index, priority, false);
          this.schedulePrefetchNeighbours(imageBuffer, paint, index, priority);
        }

        // If we've not prepared an initial "meaningful paint", then skip the
        // rendering to avoid tiles loading in, breaking the illusion a bit.
        if (!this.firstMeaningfulPaint) {
          return;
        }

        if (canvasToPaint && !isInvalidated) {
          const fadeAlpha = this.getFadeAlpha(paint, tileState, isActiveLayer);
          if (fadeAlpha < 1) {
            this.hasTilesFading = true;
          }
          this.ctx.globalAlpha = ga * baseOpacity * fadeAlpha;

          const warpTile = isWarpedImage(paint) ? paint.getWarpTile(index) : undefined;
          if (warpTile) {
            this.drawWarpedTile(canvasToPaint, warpTile, x, y, width, height);
          } else if (paint.crop && paint.cropData) {
            if (paint.crop[index * 5]) {
              const source = [
                paint.crop[index * 5 + 1] / paint.display.scale - paint.display.points[index * 5 + 1],
                paint.crop[index * 5 + 2] / paint.display.scale - paint.display.points[index * 5 + 2],
                1 + (paint.crop[index * 5 + 3] - paint.crop[index * 5 + 1]) / paint.display.scale,
                1 + (paint.crop[index * 5 + 4] - paint.crop[index * 5 + 2]) / paint.display.scale,
              ];

              source[0] += paint.cropData.x / paint.display.scale;
              source[1] += paint.cropData.y / paint.display.scale;

              const translationDeltaX = paint.x * this.lastKnownScale;
              const translationDeltaY = paint.y * this.lastKnownScale;

              const target = [x + translationDeltaX, y + translationDeltaY, width, height];
              target[0] += translationDeltaX;
              target[1] += translationDeltaY;

              this.ctx.imageSmoothingEnabled = needsSmoothing(source[2], source[3], target[2], target[3]);

              this.ctx.drawImage(
                canvasToPaint,
                source[0],
                source[1],
                source[2],
                source[3],
                target[0],
                target[1],
                target[2] + 1,
                target[3] + 1
              );
            }
          } else {
            const sourceWidth = paint.display.points[index * 5 + 3] - paint.display.points[index * 5 + 1];
            const sourceHeight = paint.display.points[index * 5 + 4] - paint.display.points[index * 5 + 2];

            // Tiles are pre-rendered into canvasToPaint at their own native
            // resolution, so a draw here at ~1:1 (sourceWidth/Height ==
            // width/height) needs no resampling. Left smoothed, a rotated
            // world (translate/rotate pivot on sub-pixel screen
            // coordinates, even at a clean 90deg) still lands every source
            // pixel off the destination grid, and bilinear filtering
            // softens an already-native-resolution tile for no reason.
            // Genuinely up/downscaled tiles still want smoothing to avoid
            // a blocky look, so only skip it when the draw is ~1:1.
            this.ctx.imageSmoothingEnabled = needsSmoothing(sourceWidth, sourceHeight, width, height);

            if (isFirefox) {
              this.ctx.drawImage(
                canvasToPaint,
                0, // paint.display.points[index * 5 + 1],
                0, // paint.display.points[index * 5 + 2],
                sourceWidth,
                sourceHeight,
                x,
                y,
                width + 1,
                height + 1
              );
            } else {
              this.ctx.drawImage(
                canvasToPaint,
                0, // paint.display.points[index * 5 + 1],
                0, // paint.display.points[index * 5 + 2],
                sourceWidth,
                sourceHeight,
                x,
                y,
                width + Number.MIN_VALUE + 0.5,
                height + Number.MIN_VALUE + 0.5
              );
            }
          }
        }
      } catch (err) {
        // nothing to do here, likely that the image isn't loaded yet.
      } finally {
        if (didRotate) {
          this.ctx.restore();
        }
        this.ctx.globalAlpha = ga;
      }
    }

    const isBox = paint instanceof Box && this.options.box;
    const isGeometry = paint instanceof Geometry && this.options.polygon;
    if ((isBox || isGeometry) && !paint.props.className && !paint.props.html && !paint.props.href) {
      this.visible.push(paint);
      if (paint.props.style) {
        const style = Object.assign(
          //
          {},
          paint.props.style || {},
          paint.hovering ? paint.props.hoverStyles : {},
          paint.pressing ? paint.props.pressStyles : {}
        );

        const scale = paint.props.relativeStyle ? 1 : width / paint.width;
        const styleOpacity = typeof style.opacity !== 'undefined' ? style.opacity : 1;
        this.ctx.globalAlpha = ga * styleOpacity * zoneVisibilityAlpha;

        let bw = 0;
        if (typeof style.borderWidth !== 'undefined') {
          bw = parseInt(style.borderWidth, 10) * scale;
        }

        let ow = 0;
        if (typeof style.outlineWidth !== 'undefined') {
          ow = parseInt(style.outlineWidth, 10) * scale;
        }

        let oo = 0;
        if (typeof style.outlineOffset !== 'undefined') {
          oo = parseInt(style.outlineOffset, 10) * scale;
        }

        if (style.borderColor) {
          this.ctx.strokeStyle = style.borderColor;
        }

        // Box shadow
        if (style.boxShadow) {
          const shadows = style.boxShadow.split(/,(?![^(]*\))/);
          for (const shadow of shadows) {
            const parsed = shadowRegexCache[shadow] || shadowRegex.exec(shadow) || shadowRegex.exec(shadow);
            shadowRegexCache[shadow] = parsed;
            if (parsed) {
              this.ctx.save();
              this.ctx.shadowOffsetX = parseInt(parsed[1]) * this.dpi * scale;
              this.ctx.shadowOffsetY = parseInt(parsed[3]) * this.dpi * scale;
              this.ctx.shadowBlur = parseInt(parsed[5]) * this.dpi * scale;
              this.ctx.shadowColor = parsed[9];
              this.ctx.fillStyle = 'rgba(0,0,0,1)';
              this.ctx.fillRect(x + bw, y + bw, width, height);
              this.ctx.restore();
            }
          }
        }

        this.ctx.fillStyle = style.backgroundColor || 'transparent';
        this.ctx.lineWidth = bw;

        if (isGeometry) {
          const shape = (paint as any).shape;
          const rings: [number, number][][] = [shape.points || []];
          if (!shape.open && shape.holes) {
            for (const hole of shape.holes) rings.push(hole);
          }
          this.ctx.beginPath();
          for (const ring of rings) {
            const len = ring.length;
            for (let i = 0; i < len; i++) {
              const px = x + ring[i][0] * this.lastKnownScale;
              const py = y + ring[i][1] * this.lastKnownScale;
              if (i === 0) {
                this.ctx.moveTo(px, py);
              } else {
                this.ctx.lineTo(px, py);
              }
            }
            if (!shape.open) {
              this.ctx.closePath();
            }
          }
          if (bw) {
            this.ctx.stroke();
          }
          if (!shape.open) {
            // Even-odd so that holes are cut out regardless of ring winding.
            this.ctx.fill(shape.holes && shape.holes.length ? 'evenodd' : 'nonzero');
          }
        } else {
          if (bw) {
            this.ctx.strokeRect(x + bw / 2, y + bw / 2, width + bw, height + bw);
          }
          this.ctx.fillRect(x + bw, y + bw, width, height);
        }

        if (ow) {
          if (style.outlineColor) {
            this.ctx.strokeStyle = style.outlineColor;
          }
          this.ctx.lineWidth = ow;
          // Outline
          this.ctx.strokeRect(
            //
            x - ow / 2 - oo,
            y - ow / 2 - oo,
            width + bw * 2 + ow + oo * 2,
            height + bw * 2 + ow + oo * 2
          );
        }
      }

      this.ctx.globalAlpha = ga;
    }
  }

  /**
   * Draws one tile of a warped image: either a single affine draw, or a triangle mesh where each
   * triangle is clipped and drawn with the affine transform that maps its texture triangle onto its
   * destination triangle.
   */
  private drawWarpedTile(
    source: CanvasImageSource,
    tile: WarpMeshTile,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const boundsWidth = tile.bounds.x2 - tile.bounds.x1;
    const boundsHeight = tile.bounds.y2 - tile.bounds.y1;
    if (!(boundsWidth > 0) || !(boundsHeight > 0) || tile.indices.length === 0) {
      return;
    }

    const ctx = this.ctx;
    // Map-frame units to screen pixels for this tile.
    const kx = width / boundsWidth;
    const ky = height / boundsHeight;
    ctx.imageSmoothingEnabled = true;

    if (tile.destinationMask) {
      const mask = tile.destinationMask;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + mask[0] * kx, y + mask[1] * ky);
      for (let i = 2; i < mask.length; i += 2) ctx.lineTo(x + mask[i] * kx, y + mask[i + 1] * ky);
      ctx.closePath();
      ctx.clip('evenodd');
    }

    if (tile.affine) {
      const [a, b, c, d, e, f] = tile.affine;
      ctx.save();
      ctx.transform(a * kx, b * ky, c * kx, d * ky, x + e * kx, y + f * ky);
      this.clipWarpResourceMask(tile);
      ctx.drawImage(source, 0, 0);
      ctx.restore();
      if (tile.destinationMask) ctx.restore();
      return;
    }

    const { src, dst, indices } = tile;
    // Grow each clip triangle slightly so neighbouring triangles overlap instead of leaving seams.
    const grow = 0.5;
    for (let t = 0; t < indices.length; t += 3) {
      const i0 = indices[t] * 2;
      const i1 = indices[t + 1] * 2;
      const i2 = indices[t + 2] * 2;

      const s0x = src[i0];
      const s0y = src[i0 + 1];
      const s1x = src[i1];
      const s1y = src[i1 + 1];
      const s2x = src[i2];
      const s2y = src[i2 + 1];

      const d0x = x + dst[i0] * kx;
      const d0y = y + dst[i0 + 1] * ky;
      const d1x = x + dst[i1] * kx;
      const d1y = y + dst[i1 + 1] * ky;
      const d2x = x + dst[i2] * kx;
      const d2y = y + dst[i2 + 1] * ky;

      const det = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y);
      if (!det) {
        continue;
      }

      const a = ((d1x - d0x) * (s2y - s0y) - (d2x - d0x) * (s1y - s0y)) / det;
      const c = ((d2x - d0x) * (s1x - s0x) - (d1x - d0x) * (s2x - s0x)) / det;
      const e = d0x - a * s0x - c * s0y;
      const b = ((d1y - d0y) * (s2y - s0y) - (d2y - d0y) * (s1y - s0y)) / det;
      const d = ((d2y - d0y) * (s1x - s0x) - (d1y - d0y) * (s2x - s0x)) / det;
      const f = d0y - b * s0x - d * s0y;

      const cx = (d0x + d1x + d2x) / 3;
      const cy = (d0y + d1y + d2y) / 3;
      const grown = (px: number, py: number): [number, number] => {
        const dx = px - cx;
        const dy = py - cy;
        const length = Math.hypot(dx, dy) || 1;
        return [px + (dx / length) * grow, py + (dy / length) * grow];
      };
      const g0 = grown(d0x, d0y);
      const g1 = grown(d1x, d1y);
      const g2 = grown(d2x, d2y);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(g0[0], g0[1]);
      ctx.lineTo(g1[0], g1[1]);
      ctx.lineTo(g2[0], g2[1]);
      ctx.closePath();
      ctx.clip();
      ctx.transform(a, b, c, d, e, f);
      this.clipWarpResourceMask(tile);
      ctx.drawImage(source, 0, 0);
      ctx.restore();
    }
    if (tile.destinationMask) ctx.restore();
  }

  private clipWarpResourceMask(tile: WarpMeshTile) {
    const mask = tile.resourceMask;
    if (!mask) return;
    this.ctx.beginPath();
    this.ctx.moveTo(mask[0], mask[1]);
    for (let i = 2; i < mask.length; i += 2) this.ctx.lineTo(mask[i], mask[i + 1]);
    this.ctx.closePath();
    this.ctx.clip('evenodd');
  }

  schedulePaintToCanvas(
    imageBuffer: ImageBuffer,
    paint: SingleImage | TiledImage,
    index: number,
    priority: number,
    prefetch = false
  ): boolean {
    if (this.idle) return false;
    if (prefetch && this.hostCache instanceof TileCanvasCache) {
      const points = paint.display.points;
      const bytes = Math.max(
        1,
        (points[index * 5 + 3] - points[index * 5 + 1]) * (points[index * 5 + 4] - points[index * 5 + 2]) * 4
      );
      if (this.hostCache.calculatedSize + bytes > this.hostCache.maxSize) return false;
    }
    const tileState = this.getTileState(imageBuffer, index);
    const now = performance.now();
    const tileKey = this.getTileKey(paint, index);
    this.markTileRequired(tileKey, prefetch);

    if (tileState.nextRetryAt && tileState.nextRetryAt > now) {
      return false;
    }

    if (tileState.state === 'queued' || tileState.state === 'loading' || tileState.state === 'decoded') {
      return false;
    }

    this.pendingTileReveals.delete(tileKey);
    const id = this.imageCacheKey(paint, index);
    const requestKey = this.nextRequestKey(tileKey);
    imageBuffer.canvases[index] = id;

    this.setTileState(imageBuffer, index, {
      ...tileState,
      state: 'queued',
      requestedAt: now,
      error: undefined,
      lastRequestKey: requestKey,
      cancelledAt: undefined,
      skipFade: false,
    });

    this.loadingQueueOrdered = false;
    this.loadingQueue.push({
      id,
      scale: paint.display.scale,
      kind: 'network',
      tileKey,
      requestKey,
      network: true,
      distance: priority,
      paint,
      index,
      prefetch,
      task: async () => {
        const state = this.getTileState(imageBuffer, index);
        if (state.lastRequestKey !== requestKey) {
          return;
        }
        if (state.state !== 'queued' && state.state !== 'loading') {
          return;
        }
        const isCurrentlyVisible = this.visible.indexOf(paint) !== -1;
        const wasVisibleLastFrame = this.previousVisible.indexOf(paint) !== -1;
        if (!prefetch && !isCurrentlyVisible && !wasVisibleLastFrame) {
          this.setTileState(imageBuffer, index, {
            ...state,
            state: 'idle',
            cancelledAt: performance.now(),
          });
          this.pendingTileReveals.delete(tileKey);
          return;
        }

        const url = paint.getImageUrl(index);
        this.setTileState(imageBuffer, index, {
          ...state,
          state: 'loading',
          url,
          requestedAt: state.requestedAt || performance.now(),
          error: undefined,
        });

        if (CanvasRenderer.debugTileLoad) {
          CanvasRenderer.debugTileLoad({
            paintId: paint.id,
            index,
            scale: paint.display.scale,
            url,
            status: 'requested',
          });
        }

        try {
          const consumerId = `${tileKey}::${requestKey}`;
          const acquired = this.imageRequestPool.acquire(url, consumerId);
          this.inFlightImageLoads.set(tileKey, {
            tileKey,
            requestKey,
            url,
            consumerId,
            paint,
            imageBuffer,
            index,
            release: acquired.release,
          });
          const image = await acquired.promise;
          if (this.inFlightImageLoads.get(tileKey)?.requestKey !== requestKey) return;
          this.releaseInFlightTileLoad(tileKey, { silent: true });
          const currentState = this.getTileState(imageBuffer, index);
          if (currentState.lastRequestKey !== requestKey || currentState.state !== 'loading') {
            return;
          }
          this.loadingQueueOrdered = false;
          this.loadingQueue.push({
            id: `${id}--decode`,
            scale: paint.display.scale,
            kind: 'decode',
            tileKey,
            requestKey,
            distance: priority,
            paint,
            index,
            prefetch,
            task: () =>
              new Promise<void>((resolve) => {
                const stateBeforeDecode = this.getTileState(imageBuffer, index);
                if (stateBeforeDecode.lastRequestKey !== requestKey || stateBeforeDecode.state !== 'loading') {
                  resolve();
                  return;
                }
                const points = paint.display.points.slice(index * 5, index * 5 + 5);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
                canvas.width = points[3] - points[1];
                canvas.height = points[4] - points[2];
                this.drawCalls.push(() => {
                  const commitState = this.getTileState(imageBuffer, index);
                  if (commitState.lastRequestKey !== requestKey || commitState.state !== 'loading') {
                    resolve();
                    return;
                  }
                  if (CanvasRenderer.debugImageStretch) {
                    const targetWidth = points[3] - points[1];
                    const targetHeight = points[4] - points[2];
                    CanvasRenderer.debugImageStretch({
                      url,
                      naturalWidth: image.naturalWidth,
                      naturalHeight: image.naturalHeight,
                      targetWidth,
                      targetHeight,
                      x: points[1],
                      y: points[2],
                      paintId: paint.id,
                      index,
                      stretched: isImageStretched(image.naturalWidth, image.naturalHeight, targetWidth, targetHeight),
                      isVisible: this.visible.indexOf(paint) !== -1,
                    });
                  }
                  ctx.drawImage(image, 0, 0, points[3] - points[1], points[4] - points[2]);
                  // An empty cached canvas must not displace the loaded fallback before this draw commits.
                  this.hostCache.set(imageBuffer.canvases[index], canvas);
                  const finalState = this.getTileState(imageBuffer, index);
                  this.setTileState(imageBuffer, index, {
                    ...finalState,
                    state: 'decoded',
                    loadedAt: undefined,
                    error: undefined,
                    attempts: 0,
                    nextRetryAt: undefined,
                  });
                  this.enqueueTileReveal(tileKey, imageBuffer, index);
                  this.imagesLoaded++;
                  if (CanvasRenderer.debugTileLoad) {
                    CanvasRenderer.debugTileLoad({
                      paintId: paint.id,
                      index,
                      scale: paint.display.scale,
                      url,
                      status: 'loaded',
                    });
                  }
                  resolve();
                });
              }),
          });
        } catch (error) {
          if (this.inFlightImageLoads.get(tileKey)?.requestKey !== requestKey) return;
          this.releaseInFlightTileLoad(tileKey, { silent: true });
          if (isImageRequestCancelledError(error)) {
            const cancelledState = this.getTileState(imageBuffer, index);
            if (cancelledState.lastRequestKey === requestKey) {
              this.setTileState(imageBuffer, index, {
                ...cancelledState,
                state: 'idle',
                cancelledAt: performance.now(),
              });
            }
            this.pendingTileReveals.delete(tileKey);
            return;
          }

          const failedState = this.getTileState(imageBuffer, index);
          if (failedState.lastRequestKey !== requestKey) {
            return;
          }

          const attempts = (failedState.attempts || 0) + 1;
          const willRetry = attempts < this.imageLoadingConfig.maxAttempts;
          const nextRetryAt = willRetry
            ? performance.now() + getRetryDelayMs(this.imageLoadingConfig, attempts)
            : performance.now() + this.imageLoadingConfig.errorRetryIntervalMs;

          this.setTileState(imageBuffer, index, {
            ...failedState,
            state: willRetry ? 'idle' : 'error',
            error,
            attempts,
            nextRetryAt,
          });
          this.pendingTileReveals.delete(tileKey);

          if (!willRetry && CanvasRenderer.debugTileLoad) {
            CanvasRenderer.debugTileLoad({
              paintId: paint.id,
              index,
              scale: paint.display.scale,
              url,
              status: 'failed',
            });
          }

          this.emitImageError({
            severity: 'recoverable',
            imageUrl: url,
            contentId: paint.id,
            tileIndex: index,
            attempt: attempts,
            maxAttempts: this.imageLoadingConfig.maxAttempts,
            willRetry,
            nextRetryAt,
            error,
          });
        }
      },
    });
    return true;
  }
  afterPaintLayer(paint: SpacialContent, transform: Strand): void {
    // No-op
  }

  prepareLayer(paint: SpacialContent, points: Strand): void {
    this.hasActiveLayerClip = false;
    const compositeOpacity =
      isWarpedImage(paint) && paint.compositeOpacity && paint.style.opacity > 0 && paint.style.opacity < 1;
    const group = compositeOpacity ? paint.__parent : undefined;
    if (
      this.warpCompositePending &&
      (group !== this.warpCompositeGroup || paint.style?.opacity !== this.warpCompositeAlpha)
    ) {
      this.flushWarpComposite();
    }

    if (paint.__owner.value) {
      this.applyTransform(paint, points[1], points[2], points[3] - points[1], points[4] - points[2]);
    }

    if (compositeOpacity) {
      // Apply opacity once across mesh triangles and zoom levels so their overlaps do not darken the overlay.
      const canvas = this.warpCompositeCanvas || (this.warpCompositeCanvas = document.createElement('canvas'));
      if (canvas.width !== this.canvas.width) canvas.width = this.canvas.width;
      if (canvas.height !== this.canvas.height) canvas.height = this.canvas.height;
      const context = canvas.getContext('2d');
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        if (!this.warpCompositePending) context.clearRect(0, 0, canvas.width, canvas.height);
        context.setTransform(this.ctx.getTransform());
        context.globalAlpha = 1;
        this.warpCompositeAlpha = paint.style!.opacity;
        this.warpCompositeGroup = group;
        this.warpCompositeContext = this.ctx;
        this.ctx = context;
      }
    }

    if (this.shouldClipLayerToBounds(paint)) {
      const bounds = this.getBoundsFromPoints(points);
      if (bounds) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.clip();
        this.hasActiveLayerClip = true;
      }
    }

    if (!paint.__host || !paint.__host.canvas) {
      if (paint instanceof SingleImage || paint instanceof TiledImage) {
        // create it if it does not exist.
        this.createImageHost(paint);
      }
    }
  }

  finishLayer() {
    if (this.hasActiveLayerClip) {
      this.ctx.restore();
      this.hasActiveLayerClip = false;
    }
    if (this.warpCompositeContext) {
      this.ctx = this.warpCompositeContext;
      this.warpCompositeContext = undefined;
      this.warpCompositePending = true;
      if (!this.warpCompositeGroup) this.flushWarpComposite();
    }
    if (this.lastPaintedObject) {
      this.clearTransform();
    }
  }

  private flushWarpComposite() {
    if (!this.warpCompositePending) return;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha *= this.warpCompositeAlpha;
    this.ctx.drawImage(this.warpCompositeCanvas!, 0, 0);
    this.ctx.restore();
    this.warpCompositePending = false;
    this.warpCompositeGroup = undefined;
  }

  createImageHost(paint: SingleImage | TiledImage) {
    // const canvas = document.createElement('canvas');
    // canvas.width = paint.display.width;
    // canvas.height = paint.display.height;
    // canvas.getContext('2d')?.clearRect(0, 0, paint.display.width, paint.display.height);
    paint.__host = paint.__host ? paint.__host : {};
    paint.__host.canvas = {
      dispose: () => {
        const buffer = paint.__host?.canvas as ImageBuffer;
        this.loadingQueue = this.loadingQueue.filter((request) => request.paint !== paint);
        for (const [key, request] of this.inFlightImageLoads) {
          if (request.paint === paint) this.releaseInFlightTileLoad(key, { silent: true });
        }
        for (const [key, pending] of this.pendingTileReveals) {
          if (pending.imageBuffer === buffer) this.pendingTileReveals.delete(key);
        }
        this.imageBuffers.delete(buffer);
        // The bounded LRU owns reusable bitmaps across scene/window lifetimes.
        // With retention disabled, release only entries no remaining host uses.
        if (this.options.lruCache === false) {
          const retainedKeys = new Set<string>();
          for (const other of this.imageBuffers) {
            for (const key of other.canvases) retainedKeys.add(key);
          }
          for (const key of buffer.canvases) {
            if (retainedKeys.has(key)) continue;
            const canvas = this.hostCache.get(key);
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }
            this.hostCache.delete(key);
          }
        }
        // Invalidate queued decode/draw closures before their indices can be reused.
        buffer.tiles = {};
      },
      isTileLoaded: (index: number) => {
        const buffer = paint.__host.canvas as ImageBuffer;
        const key = buffer.canvases[index];
        return (
          buffer.tiles?.[index]?.state === 'decoded' &&
          !!this.hostCache.get(key) &&
          this.getFadeAlpha(paint, buffer.tiles?.[index], this.isLayerActive(paint)) === 1
        );
      },
      canvas: undefined,
      canvases: [],
      tiles: {},
      indices: [],
      loaded: [],
      loading: false,
    };
    this.imageBuffers.add(paint.__host.canvas);
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number, selectionTarget?: Strand): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor, selectionTarget);
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    const zone = world.getActiveZone();

    if (zone) {
      zone.recalculateBounds();
      const bounds = getZoneConstrainedBounds(target, zone.points, padding);
      if (bounds) {
        const width = target[3] - target[1];
        const height = target[4] - target[2];
        return {
          x1: bounds.minX,
          y1: bounds.minY,
          x2: bounds.maxX + width,
          y2: bounds.maxY + height,
        };
      }
    }
    return null;
  }

  pendingUpdate(): boolean {
    if (this.idle) return false;
    this.imagesPending =
      this.loadingQueue.length + this.tasksRunning + this.inFlightImageLoads.size + this.pendingTileReveals.size;
    const ready =
      !this.pendingDrawCall &&
      this.drawCalls.length === 0 &&
      this.loadingQueue.length === 0 &&
      this.tasksRunning === 0 &&
      this.inFlightImageLoads.size === 0 &&
      this.pendingTileReveals.size === 0;

    if (
      !ready &&
      !this.firstMeaningfulPaint &&
      !this.stagingCanvas &&
      this.visible.length > 0 &&
      this.options.readiness !== 'immediate' &&
      this.fallbackRevealTimeout === null
    ) {
      // Initial load may reveal progressively. A resource handoff keeps the complete
      // previous presentation until its replacement is ready, even on a slow request.
      this.fallbackRevealTimeout = setTimeout(() => {
        this.canvas.style.opacity = '1';
        this.firstMeaningfulPaint = true;
        this.fallbackRevealTimeout = null;
      }, MAX_WAIT_FOR_MEANINGFUL_PAINT_MS);
    }

    const waitingForScene = this.stagingCanvas && this.waitForSceneChange && !this.stagedSceneChanged;
    if (
      !waitingForScene &&
      !this.firstMeaningfulPaint &&
      ready &&
      (this.visible.length || this.options.readiness === 'immediate')
    ) {
      // Fade in the canvas?
      this.canvas.style.opacity = '1';
      // We've not rendered yet, can we render this  frame?
      this.firstMeaningfulPaint = ready;
      // We need to return true here to ensure our update is done.
      return true;
    }

    if (this.options.debug) {
      return true;
    }

    if (this.hasTilesFading) {
      return true;
    }

    return !ready;
  }

  getRendererScreenPosition() {
    return this.rendererPosition;
  }

  resetReadyState(reason?: AtlasReadyResetReason) {
    if (this.options.readiness === 'immediate') {
      return;
    }
    // Keep the last complete presentation while a new scene schedules/decodes its tiles.
    // Normal panning/zooming remains a direct draw; only a resource readiness reset stages frames.
    if (!this.stagingCanvas && this.firstMeaningfulPaint && this.canvas.width && this.canvas.height) {
      const canvas = document.createElement('canvas');
      canvas.width = this.canvas.width;
      canvas.height = this.canvas.height;
      const context = canvas.getContext('2d');
      if (context) {
        this.presentationContext = this.ctx;
        this.stagingCanvas = canvas;
        this.ctx = context;
      }
    }
    if (this.stagingCanvas) {
      this.stagedFrom = new Map(
        this.visible.map((paint) => [paint, (paint as SingleImage | TiledImage).getImageUrl?.(0)])
      );
    }
    this.waitForSceneChange = reason === 'ready-reset-key-change' || reason === 'resource-transition-key-change';
    this.stagedSceneChanged = false;
    this.firstMeaningfulPaint = false;
    if (this.fallbackRevealTimeout) {
      clearTimeout(this.fallbackRevealTimeout);
      this.fallbackRevealTimeout = null;
    }
  }

  resetImageFadeState() {
    const now = performance.now();
    for (const paint of this.visible) {
      if (!(paint instanceof SingleImage || paint instanceof TiledImage)) {
        continue;
      }
      const imageBuffer = paint.__host?.canvas;
      const tiles = imageBuffer?.tiles;
      if (!tiles) {
        continue;
      }
      for (const indexKey of Object.keys(tiles)) {
        const index = Number(indexKey);
        const tileState = tiles[index];
        if (tileState?.state !== 'decoded') {
          continue;
        }
        this.setTileState(imageBuffer, index, {
          ...tileState,
          loadedAt: now,
          fadeStartedAt: undefined,
          skipFade: false,
        });
      }
    }
    this.hasTilesFading = true;
  }

  setIdle(idle: boolean) {
    if (this.idle === idle) return;
    this.idle = idle;
    if (idle) {
      this.requiredTileKeys.clear();
      this.requiredPrefetchTileKeys.clear();
      this.pruneStaleTileWork();
      if (this._scheduled) {
        clearInterval(this._scheduled);
        this._scheduled = 0;
      }
    }
  }

  reset() {
    this.warpCompositePending = false;
    this.warpCompositeGroup = undefined;
    if (this.warpCompositeCanvas) {
      this.warpCompositeCanvas.width = 0;
      this.warpCompositeCanvas.height = 0;
      this.warpCompositeCanvas = undefined;
    }
    if (this.presentationContext) this.ctx = this.presentationContext;
    this.presentationContext = undefined;
    if (this.stagingCanvas) this.stagingCanvas.width = this.stagingCanvas.height = 0;
    this.stagingCanvas = undefined;
    this.stagedFrom.clear();
    this.resetGeneration += 1;
    this.loadingQueue = [];
    this.drawCalls = [];
    if (this._scheduled) {
      clearInterval(this._scheduled);
      this._scheduled = 0;
    }
    for (const tileKey of [...this.inFlightImageLoads.keys()]) {
      this.releaseInFlightTileLoad(tileKey, { silent: true });
    }
    this.imageRequestPool.cancelAll({ silent: true });
    this.inFlightImageLoads.clear();
    this.requiredTileKeys.clear();
    this.requiredPrefetchTileKeys.clear();
    this.pendingTileReveals.clear();
    for (const canvas of this.hostCache.values()) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.hostCache.clear();
    this.frameCanvasKeys.clear();
    this.invalidated = [];
    for (const buffer of this.imageBuffers) {
      buffer.canvases = [];
      buffer.tiles = {};
      buffer.indices = [];
      buffer.loaded = [];
      buffer.loading = false;
    }
    this.imageBuffers.clear();
    this.visible = [];
    this.previousVisible = [];
    this.lastPaintedObject = undefined;
    this.imageIdsLoaded = [];
    this.currentTask = Promise.resolve();
    this.tasksRunning = 0;
    this.frameTasks = 0;
    this.frameIsRendering = false;
    this.pendingDrawCall = false;
    this.requestGeneration += 1;
    this.frameCounter = 0;
    if (this.fallbackRevealTimeout) {
      clearTimeout(this.fallbackRevealTimeout);
      this.fallbackRevealTimeout = null;
    }
    this.imagesPending = 0;
    this.imagesLoaded = 0;
    this.hasTilesFading = false;
  }
}
