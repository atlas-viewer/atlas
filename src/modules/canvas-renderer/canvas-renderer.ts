import { Strand } from '@atlas-viewer/dna';
import { Paint, Paintable, WorldObject } from '../../world-objects';
import { PositionPair } from '../../types';
import { distance } from '../../utils';
import { Text } from '../../objects/text';
import { SingleImage } from '../../spacial-content/single-image';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { TiledImage } from '../../spacial-content/tiled-image';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Box } from '../../objects/box';
import LRUCache from 'lru-cache';
import { Geometry } from '../../objects/geometry';
import { HookOptions } from '../../standalone';
import { buildCssFilter } from '../shared/build-css-filter';
import { AtlasImageLoadErrorEvent } from '../shared/image-load-events';
import { getRetryDelayMs, ImageLoadingConfig, resolveImageLoadingConfig } from '../shared/image-loading-config';
import { ImageRequestPool, isImageRequestCancelledError } from '../shared/image-request-pool';

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

export type TileLoadingState = {
  state: 'idle' | 'queued' | 'loading' | 'decoded' | 'error';
  requestedAt?: number;
  loadedAt?: number;
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

const imageCache = new Map<string, HTMLImageElement>();
const hostCache: Record<string, any> = {};

export class CanvasRenderer implements Renderer {
  /**
   * The primary viewing space for the viewer.
   */
  canvas: HTMLCanvasElement;

  /**
   * Canvas context for `this.canvas`
   */
  ctx: CanvasRenderingContext2D;

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
  hostCache: LRUCache<string, HTMLCanvasElement>;
  invalidated: string[] = [];
  fallbackRevealTimeout: ReturnType<typeof setTimeout> | null = null;
  framePrefetchCount = 0;
  hasTilesFading = false;

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;
    this.rendererPosition = canvas.getBoundingClientRect();
    // Not working as expected.
    // this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
    this.ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = true;
    this.options = options || {};
    this.imageLoadingConfig = resolveImageLoadingConfig(this.options.imageLoading);
    this.parallelTasks = this.imageLoadingConfig.maxConcurrentRequests;
    this.maxPrefetchPerFrame = this.imageLoadingConfig.maxPrefetchPerFrame;
    this.imageRequestPool = new ImageRequestPool({
      timeoutMs: this.imageLoadingConfig.timeoutMs,
      crossOrigin: this.options.crossOrigin ? 'anonymous' : undefined,
      useFetch: !!this.options.crossOrigin,
      cache: imageCache,
    });
    // Testing fade in.
    // this.canvas.style.opacity = '0';
    this.canvas.style.transition = 'opacity .3s';
    this.dpi = options?.dpi || 1;
    if (this.options.readiness === 'immediate') {
      this.firstMeaningfulPaint = true;
      this.canvas.style.opacity = '1';
    }

    this.hostCache = options?.lruCache
      ? new LRUCache<string, HTMLCanvasElement>({
          maxSize: 1024 * 512 * 512, // 250MB total.
          dispose: (value, key, reason) => {
            this.invalidated.push(key);
            value.width = 0;
            value.height = 0;
          },
          sizeCalculation: (value, key) => {
            return value.width * value.height;
          },
        })
      : ({
          store: {},
          get(id: string) {
            return this.store[id];
          },
          set(id: string, value: any) {
            this.store[id] = value;
          },
        } as any);

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
    return { width: this.canvas.width / this.dpi, height: this.canvas.height / this.dpi };
  }

  resize() {
    this.rendererPosition = this.canvas.getBoundingClientRect();
  }

  isReady(): boolean {
    return this.firstMeaningfulPaint;
  }

  afterFrame(world: World): void {
    // this.lastPaintedObject = paint.__owner.value;
    this.clearTransform();
    this.lastPaintedObject = undefined;
    // this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    // this.ctx.rotate((90 * Math.PI) / 180);
    // this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);
    this.frameIsRendering = false;
    this.imagesPending = this.loadingQueue.length + this.tasksRunning + this.inFlightImageLoads.size + this.pendingTileReveals.size;
    this.imagesLoaded = 0;
    if (!this.loadingQueueOrdered /*&& this.loadingQueue.length > this.parallelTasks*/) {
      this.loadingQueue = this.loadingQueue.sort((a, b) => {
        if (a.network) {
          if (a.scale === b.scale) {
            return b.distance - a.distance;
          }
        }

        return a.scale < b.scale ? -1 : 1;
      });
      this.loadingQueueOrdered = true;
    }
    // Set them.
    this.previousVisible = this.visible;
    this.pruneStaleTileWork();
    this.pendingDrawCall = !!this.drawCalls.length;
    if (this.pendingDrawCall) {
      for (let i = 0; i < this.drawCalls.length; i++) {
        const nextCall = this.drawCalls.shift();
        if (nextCall) nextCall();
      }
    }
    // Some off-screen work might need done, like loading new images in.
    this.doOffscreenWork();
    // Stats
    if (this.options.debug && this.stats) {
      this.stats.end();
    }
  }

  doOffscreenWork() {
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
        // And kick it off. We don't care if it succeeded or not.
        // A task that needs to retry should just add a new task.
        this.currentTask = next
          .task()
          .then(() => {
            this.tasksRunning--;
          })
          .catch(() => {
            this.tasksRunning--;
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
    this.frameIsRendering = true;
    this.frameCounter += 1;
    this.visible = [];
    this.framePrefetchCount = 0;
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

    const filter = buildCssFilter(options);
    if (this.ctx.filter !== filter) {
      this.ctx.filter = filter;
    }
  }

  applyTransform(paint: Paintable, x: number, y: number, width: number, height: number) {
    const owner = paint.__owner.value;
    if (owner && owner.rotation) {
      this.ctx.save();
      const moveX = x + width / 2;
      const moveY = y + height / 2;

      this.ctx.translate(moveX, moveY);
      this.ctx.rotate((owner.rotation * Math.PI) / 180);
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
    if (!tileState?.loadedAt) {
      return 1;
    }
    if (!isActiveLayer && !options.fadeFallbackTiles) {
      return 1;
    }
    const elapsed = performance.now() - tileState.loadedAt;
    return Math.max(0, Math.min(1, elapsed / options.fadeInMs));
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

    const columns = paint.columns;
    const rows = paint.rows;
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

  paint(paint: SpacialContent | Text | Box, index: number, x: number, y: number, width: number, height: number): void {
    const ga = this.ctx.globalAlpha;

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

        const baseOpacity = typeof paint.style?.opacity !== 'undefined' ? paint.style.opacity : 1;
        if (!baseOpacity) {
          return;
        }
        this.ctx.globalAlpha = ga * baseOpacity;

        const imageBuffer = this.ensureImageBuffer(paint);
        const tileState = this.getTileState(imageBuffer, index);
        tileState.lastUsedAt = performance.now();
        this.setTileState(imageBuffer, index, tileState);
        const tileKey = this.getTileKey(paint, index);
        this.markTileRequired(tileKey, false);

        const isActiveLayer = this.isLayerActive(paint);
        const canvas = this.getCanvasDims();
        const priority = distance({ x: x + width / 2, y: y + height / 2 }, { x: canvas.width / 2, y: canvas.height / 2 });
        const isInvalidated = this.invalidated.indexOf(imageBuffer.canvases[index]) !== -1;
        const canvasToPaint = this.hostCache.get(imageBuffer.canvases[index]);
        const hasImage = !!canvasToPaint && !isInvalidated;

        if (isInvalidated) {
          this.setTileState(imageBuffer, index, { ...tileState, state: 'idle' });
        }

        if ((isInvalidated || !hasImage || tileState.state === 'idle' || tileState.state === 'error') && isActiveLayer) {
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

          if (paint.crop && paint.cropData) {
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
            if (isFirefox) {
              this.ctx.drawImage(
                canvasToPaint,
                0,
                0,
                paint.display.points[index * 5 + 3] - paint.display.points[index * 5 + 1],
                paint.display.points[index * 5 + 4] - paint.display.points[index * 5 + 2],
                x,
                y,
                width + 1,
                height + 1
              );
            } else {
              this.ctx.drawImage(
                canvasToPaint,
                0,
                0,
                paint.display.points[index * 5 + 3] - paint.display.points[index * 5 + 1],
                paint.display.points[index * 5 + 4] - paint.display.points[index * 5 + 2],
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

        if (typeof style.opacity !== 'undefined') {
          this.ctx.globalAlpha = style.opacity;
        }

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
          const points = shape.points || [];
          const len = points.length;
          this.ctx.beginPath();
          for (let i = 0; i < len; i++) {
            this.ctx.lineTo(x + points[i][0] * this.lastKnownScale, y + points[i][1] * this.lastKnownScale);
          }
          if (!shape.open) {
            this.ctx.closePath();
          }
          if (bw) {
            this.ctx.stroke();
          }
          if (!shape.open) {
            this.ctx.fill();
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

  schedulePaintToCanvas(
    imageBuffer: ImageBuffer,
    paint: SingleImage | TiledImage,
    index: number,
    priority: number,
    prefetch = false
  ): boolean {
    const tileState = this.getTileState(imageBuffer, index);
    const now = performance.now();
    const tileKey = this.getTileKey(paint, index);
    this.markTileRequired(tileKey, prefetch);
    this.pendingTileReveals.delete(tileKey);

    if (tileState.nextRetryAt && tileState.nextRetryAt > now) {
      return false;
    }

    if (tileState.state === 'queued' || tileState.state === 'loading' || tileState.state === 'decoded') {
      return false;
    }

    const id = `${paint.id}--${paint.display.scale}-${index}`;
    const requestKey = this.nextRequestKey(tileKey);
    imageBuffer.canvases[index] = id;
    const idx = this.invalidated.indexOf(id);
    if (idx !== -1) {
      this.invalidated.splice(idx, 1);
    }

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
        if (this.visible.indexOf(paint) === -1) {
          this.setTileState(imageBuffer, index, { ...state, state: 'idle', cancelledAt: performance.now() });
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
                this.hostCache.set(imageBuffer.canvases[index], canvas);
                this.drawCalls.push(() => {
                  const commitState = this.getTileState(imageBuffer, index);
                  if (commitState.lastRequestKey !== requestKey || commitState.state !== 'loading') {
                    resolve();
                    return;
                  }
                  ctx.drawImage(image, 0, 0, points[3] - points[1], points[4] - points[2]);
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
                  resolve();
                });
              }),
          });
        } catch (error) {
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
    if (paint.__owner.value) {
      if (paint.cropData) {
        const scale = this.lastKnownScale * (1 / paint.display.scale);
        this.applyTransform(paint, points[1], points[2], points[3] - points[1], points[4] - points[2]);
        // this.applyTransform(
        //   paint,
        //   points[1] - paint.cropData.x * scale + paint.points[1] * scale,
        //   points[2] - paint.cropData.y * scale + paint.points[2] * scale,
        //   paint.cropData.width * this.lastKnownScale,
        //   paint.cropData.height * this.lastKnownScale
        // );
      } else {
        this.applyTransform(paint, points[1], points[2], points[3] - points[1], points[4] - points[2]);
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
    if (this.lastPaintedObject) {
      this.clearTransform();
    }
  }

  createImageHost(paint: SingleImage | TiledImage) {
    // const canvas = document.createElement('canvas');
    // canvas.width = paint.display.width;
    // canvas.height = paint.display.height;
    // canvas.getContext('2d')?.clearRect(0, 0, paint.display.width, paint.display.height);
    paint.__host = paint.__host ? paint.__host : {};
    paint.__host.canvas = { canvas: undefined, canvases: [], tiles: {}, indices: [], loaded: [], loading: false };
    // hostCache[paint.id] = paint.__host;
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    const zone = world.getActiveZone();

    if (zone) {
      const xCon = target[3] - target[1] < zone.points[3] - zone.points[1];
      const yCon = target[4] - target[2] < zone.points[4] - zone.points[2];
      return {
        x1: xCon
          ? zone.points[1] - padding
          : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
        y1: yCon
          ? zone.points[2] - padding
          : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
        x2: xCon
          ? zone.points[3] + padding
          : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
        y2: yCon
          ? zone.points[4] + padding
          : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
      };
    }
    return null;
  }

  pendingUpdate(): boolean {
    this.imagesPending = this.loadingQueue.length + this.tasksRunning + this.inFlightImageLoads.size + this.pendingTileReveals.size;
    const ready =
      !this.pendingDrawCall &&
      this.drawCalls.length === 0 &&
      this.loadingQueue.length === 0 &&
      this.tasksRunning === 0 &&
      this.inFlightImageLoads.size === 0 &&
      this.pendingTileReveals.size === 0;

    if (!ready && this.visible.length === 0 && this.options.readiness !== 'immediate' && this.fallbackRevealTimeout === null) {
      // If its still not ready by 500ms, force it to be.
      this.fallbackRevealTimeout = setTimeout(() => {
        this.canvas.style.opacity = '1';
        this.firstMeaningfulPaint = true;
        this.fallbackRevealTimeout = null;
      }, 500);
    }

    if (!this.firstMeaningfulPaint && ready && (this.visible.length || this.options.readiness === 'immediate')) {
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

  resetReadyState() {
    if (this.options.readiness === 'immediate') {
      return;
    }
    this.firstMeaningfulPaint = false;
    if (this.fallbackRevealTimeout) {
      clearTimeout(this.fallbackRevealTimeout);
      this.fallbackRevealTimeout = null;
    }
  }

  reset() {
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
