import { Renderer } from '../../renderer/renderer';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { Box } from '../../objects/box';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';
import { Strand } from '@atlas-viewer/dna';
import { World } from '../../world';
import { Paint } from '../../world-objects/paint';
import { PositionPair } from '../../types';
import { ImageTexture } from '../../spacial-content/image-texture';
import { HookOptions } from '../../renderer/runtime';
import { buildCssFilter } from '../shared/build-css-filter';
import { AtlasWebGLFallbackEvent } from './types';
import { isWebGLImageFastPathCandidate } from './webgl-eligibility';
import { AtlasImageLoadErrorEvent } from '../shared/image-load-events';
import { getRetryDelayMs, ImageLoadingConfig, resolveImageLoadingConfig } from '../shared/image-loading-config';
import { ImageRequestPool, isImageRequestCancelledError } from '../shared/image-request-pool';

export type { AtlasWebGLFallbackEvent, AtlasWebGLFallbackReason } from './types';

export type WebGLRendererOptions = {
  dpi?: number;
  onFatalImageError?: (event: AtlasWebGLFallbackEvent) => void;
  onImageError?: (event: AtlasImageLoadErrorEvent) => void;
  imageLoading?: Partial<ImageLoadingConfig>;
  fallbackOnImageLoadError?: boolean;
  readiness?: 'first-meaningful-paint' | 'immediate';
};

type WebGLTileRequest = {
  key: string;
  tileKey: string;
  requestKey: string;
  paint: SingleImage | TiledImage;
  index: number;
  url: string;
  priority: number;
  prefetch: boolean;
};

type WebGLTileLoadingState = {
  state: 'idle' | 'queued' | 'loading' | 'decoded' | 'error';
  attempts?: number;
  nextRetryAt?: number;
  lastRequestKey?: string;
  cancelledAt?: number;
  error?: unknown;
  url?: string;
  requestedAt?: number;
  skipFade?: boolean;
};

type InFlightTileLoad = {
  tileKey: string;
  requestKey: string;
  consumerId: string;
  paint: SingleImage | TiledImage;
  index: number;
  release: (opts?: { silent?: boolean }) => void;
};

const imageCache = new Map<string, HTMLImageElement>();

export class WebGLRenderer implements Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  options: WebGLRendererOptions;
  fatalImageError?: AtlasWebGLFallbackEvent;

  program: WebGLProgram;
  fragmentShader: WebGLShader;
  vertexShader: WebGLShader;

  rectBuffer: Float32Array;

  // language=GLSL
  fragmentShaderSource = `
    precision mediump float;

    uniform sampler2D u_image;
    uniform float u_alpha;
    varying vec2 v_texCoord;

    void main() {
        vec4 color = texture2D(u_image, v_texCoord);
        gl_FragColor = vec4(color.rgb, color.a * u_alpha);
    }
  `;

  // language=GLSL
  vertexShaderSource = `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    varying vec4 v_color;
    uniform sampler2D u_texture;

    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {

        // convert the position from pixels to 0.0 to 1.0
        vec2 zeroToOne = a_position / u_resolution;

        // convert from 0->1 to 0->2
        vec2 zeroToTwo = zeroToOne * 2.0;

        // convert from 0->2 to -1->+1 (clip space)
        vec2 clipSpace = zeroToTwo - 1.0;

        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        
        v_texCoord = a_texCoord;
    }
  `;

  attributes: {
    position: number;
    texCoord: number;
  };
  uniforms: {
    resolution: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
    alpha: WebGLUniformLocation | null;
  };
  buffers: {
    position: WebGLBuffer;
    texCoord: WebGLBuffer;
  };
  rendererPosition: DOMRect;
  dpi: number;
  maxConcurrentTasks = 6;
  maxPrefetchPerFrame = 8;
  imageLoadingConfig: ImageLoadingConfig;
  imageRequestPool: ImageRequestPool;
  framePrefetchCount = 0;
  loadingCount = 0;
  hasTilesFading = false;
  firstMeaningfulPaint = false;
  frameSawFastPathCandidate = false;
  requiresRepaint = true;
  tileRequestQueue: WebGLTileRequest[] = [];
  queuedTileRequestKeys = new Set<string>();
  inFlightImageLoads = new Map<string, InFlightTileLoad>();
  requiredTileKeys = new Set<string>();
  requiredPrefetchTileKeys = new Set<string>();
  requestGeneration = 0;
  frameCounter = 0;
  pendingTileReveals = new Map<
    string,
    {
      paint: SingleImage | TiledImage;
      index: number;
      queuedFrame: number;
    }
  >();
  onContextLost = (event: Event) => {
    event.preventDefault();
    this.emitFatalImageError({
      reason: 'webgl-context-lost',
      error: event,
    });
  };

  constructor(canvas: HTMLCanvasElement, options?: WebGLRendererOptions) {
    this.canvas = canvas;
    this.rendererPosition = canvas.getBoundingClientRect();
    this.options = options || {};
    this.imageLoadingConfig = resolveImageLoadingConfig(this.options.imageLoading);
    this.maxConcurrentTasks = this.imageLoadingConfig.maxConcurrentRequests;
    this.maxPrefetchPerFrame = this.imageLoadingConfig.maxPrefetchPerFrame;
    this.imageRequestPool = new ImageRequestPool({
      timeoutMs: this.imageLoadingConfig.timeoutMs,
      crossOrigin: 'anonymous',
      useFetch: true,
      cache: imageCache,
    });

    const gl = canvas.getContext('webgl2');
    if (!gl) {
      this.emitFatalImageError({
        reason: 'webgl-context-unavailable',
        error: new Error('WebGL2 context unavailable'),
      });
      throw new Error('WebGL2 context unavailable');
    }
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', this.onContextLost as EventListener);

    this.fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, this.fragmentShaderSource);
    this.vertexShader = this.createShader(this.gl.VERTEX_SHADER, this.vertexShaderSource);
    this.program = this.createProgram(this.vertexShader, this.fragmentShader);
    this.dpi = options?.dpi || 1;

    // Shader locations.
    this.attributes = {
      position: this.gl.getAttribLocation(this.program, 'a_position'),
      texCoord: this.gl.getAttribLocation(this.program, 'a_texCoord'),
    };
    this.uniforms = {
      resolution: this.gl.getUniformLocation(this.program, 'u_resolution'),
      texture: this.gl.getUniformLocation(this.program, 'u_texture'),
      alpha: this.gl.getUniformLocation(this.program, 'u_alpha'),
    };

    this.buffers = {
      position: this.createArrayBuffer(),
      texCoord: this.createArrayBuffer(new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0])),
    };

    this.rectBuffer = new Float32Array(12);

    // Resize step.
    this.resize();

    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(this.program);
    this.gl.enableVertexAttribArray(this.attributes.position);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    if (this.isImmediateReadiness()) {
      this.firstMeaningfulPaint = true;
    }
  }

  private isImmediateReadiness() {
    return this.options.readiness === 'immediate';
  }

  emitFatalImageError(event: Omit<AtlasWebGLFallbackEvent, 'from' | 'to'>) {
    if (this.fatalImageError) {
      return;
    }
    const fullEvent: AtlasWebGLFallbackEvent = {
      from: 'webgl',
      to: 'canvas',
      ...event,
    };
    this.fatalImageError = fullEvent;
    if (this.options.onFatalImageError) {
      this.options.onFatalImageError(fullEvent);
    }
  }

  resize() {
    this.resizeCanvasToDisplaySize();
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.rendererPosition = this.canvas.getBoundingClientRect();
  }

  isReady() {
    if (this.isImmediateReadiness()) {
      return true;
    }

    if (this.firstMeaningfulPaint) {
      return true;
    }

    if (!this.frameSawFastPathCandidate) {
      return (
        this.tileRequestQueue.length === 0 &&
        this.loadingCount === 0 &&
        this.inFlightImageLoads.size === 0 &&
        this.pendingTileReveals.size === 0
      );
    }

    return false;
  }

  beforeFrame(world: World, delta: number, target: Strand, options: HookOptions) {
    this.hasTilesFading = false;
    this.requiresRepaint = false;
    this.frameSawFastPathCandidate = false;
    this.framePrefetchCount = 0;
    this.frameCounter += 1;
    this.requiredTileKeys.clear();
    this.requiredPrefetchTileKeys.clear();
    this.flushTileRevealBatch();

    const filter = buildCssFilter(options);
    if (this.canvas.style.filter !== filter) {
      this.canvas.style.filter = filter;
    }

    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);
    // Runtime coordinates are in CSS pixels, so keep shader resolution in CSS pixel space.
    this.gl.uniform2f(this.uniforms.resolution, this.gl.canvas.width / this.dpi, this.gl.canvas.height / this.dpi);
    if (this.lastResize > 1000) {
      this.lastResize = 0;
      this.resizeCanvasToDisplaySize();
    }
    this.lastResize += delta;
  }

  lastResize = 0;

  prepareLayer(paint: SpacialContent) {
    if (!paint.__host || !paint.__host.webgl) {
      if ((paint instanceof SingleImage || paint instanceof TiledImage) && isWebGLImageFastPathCandidate(paint, 0)) {
        this.createImageHost(paint);
      }
      if (paint instanceof ImageTexture) {
        this.createTextureHost(paint);
      }
    }
  }

  createTextureHost(paint: ImageTexture | Box) {
    paint.__host = paint.__host ? paint.__host : {};

    const gl = this.gl;
    const texture = this.gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    let lastImage;

    if (paint instanceof ImageTexture) {
      const initial = paint.getTexture();
      if (initial.source) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initial.source);
        } catch (error) {
          this.emitFatalImageError({
            reason: 'teximage-security',
            contentId: paint.id,
            error,
          });
        }
      }
      lastImage = initial;
    } else {
      // @todo draw box and set webgl.updateTexture function.
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);

    paint.__host.webgl = {
      height: paint.height,
      width: paint.width,
      texture,
      lastImage,
    };
  }

  createImageHost(paint: SingleImage | TiledImage) {
    const textures = [...new Array(paint.points.length / 5)];

    paint.__host = paint.__host ? paint.__host : {};

    paint.__host.webgl = {
      height: paint.height,
      width: paint.width,
      textures,
      loading: [],
      loaded: [],
      loadedAt: [],
      tileState: {},
      lastLevelRendered: -1,
      onLoad: (index: number, image: any) => {
        const gl = this.gl;
        const texture = this.gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        } catch (error) {
          this.emitFatalImageError({
            reason: 'teximage-security',
            imageUrl: paint.getImageUrl ? paint.getImageUrl(index) : undefined,
            contentId: paint.id,
            tileIndex: index,
            error,
          });
          this.removeLoadingIndex(paint, index);
          return;
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        paint.__host.webgl.textures[index] = texture;
        paint.__host.webgl.loaded.push(index);
        paint.__host.webgl.loadedAt[index] = undefined;
        this.setTileState(paint, index, {
          ...this.getTileState(paint, index),
          state: 'decoded',
          attempts: 0,
          nextRetryAt: undefined,
          error: undefined,
        });
        this.enqueueTileReveal(this.getTileKey(paint, index), paint, index);
        this.requiresRepaint = true;
        this.removeLoadingIndex(paint, index);
      },
    };
  }

  removeLoadingIndex(paint: SpacialContent, index: number) {
    if (!paint.__host?.webgl?.loading) {
      return;
    }
    const loadingIndex = paint.__host.webgl.loading.indexOf(index);
    if (loadingIndex !== -1) {
      paint.__host.webgl.loading.splice(loadingIndex, 1);
      this.loadingCount = Math.max(0, this.loadingCount - 1);
      this.requiresRepaint = true;
    }
  }

  private getTileKey(paint: SingleImage | TiledImage, index: number): string {
    return `${paint.id}::${paint.display.scale}::${index}`;
  }

  private nextRequestKey(tileKey: string): string {
    this.requestGeneration += 1;
    return `${tileKey}::${this.requestGeneration}`;
  }

  private getTileState(paint: SingleImage | TiledImage, index: number): WebGLTileLoadingState {
    const host = paint.__host?.webgl;
    if (!host) {
      return { state: 'idle' };
    }
    if (!host.tileState) {
      host.tileState = {};
    }
    if (!host.tileState[index]) {
      host.tileState[index] = { state: 'idle' };
    }
    return host.tileState[index] as WebGLTileLoadingState;
  }

  private setTileState(paint: SingleImage | TiledImage, index: number, state: WebGLTileLoadingState) {
    const host = paint.__host?.webgl;
    if (!host) {
      return;
    }
    if (!host.tileState) {
      host.tileState = {};
    }
    host.tileState[index] = state;
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

  private shouldSkipFade(tileState: WebGLTileLoadingState | undefined, now = performance.now()): boolean {
    if (!tileState?.requestedAt) {
      return false;
    }
    return now - tileState.requestedAt <= this.imageLoadingConfig.skipFadeIfLoadedWithinMs;
  }

  private enqueueTileReveal(tileKey: string, paint: SingleImage | TiledImage, index: number) {
    const now = performance.now();
    if (this.imageLoadingConfig.revealDelayFrames === 0 && this.imageLoadingConfig.revealBatchWindowFrames === 0) {
      if (paint.__host?.webgl?.loadedAt) {
        paint.__host.webgl.loadedAt[index] = now;
      }
      const state = this.getTileState(paint, index);
      this.setTileState(paint, index, {
        ...state,
        skipFade: this.shouldSkipFade(state, now),
      });
      return;
    }

    this.pendingTileReveals.set(tileKey, {
      paint,
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
        const host = pending.paint.__host?.webgl;
        const state = this.getTileState(pending.paint, pending.index);
        if (host?.loadedAt && state.state === 'decoded' && !host.loadedAt[pending.index]) {
          host.loadedAt[pending.index] = now;
          this.setTileState(pending.paint, pending.index, {
            ...state,
            skipFade: this.shouldSkipFade(state, now),
          });
          this.requiresRepaint = true;
        }
        this.pendingTileReveals.delete(tileKey);
        cursor += 1;
      }
    }
  }

  private emitImageError(event: Omit<AtlasImageLoadErrorEvent, 'renderer'>) {
    if (this.options.onImageError) {
      this.options.onImageError({
        renderer: 'webgl',
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
    this.tileRequestQueue = this.tileRequestQueue.filter((request) => {
      if (this.isTileRequired(request.tileKey)) {
        return true;
      }
      this.queuedTileRequestKeys.delete(request.key);
      const state = this.getTileState(request.paint, request.index);
      if (state.lastRequestKey === request.requestKey && state.state === 'queued') {
        this.setTileState(request.paint, request.index, {
          ...state,
          state: 'idle',
          cancelledAt: performance.now(),
        });
      }
      this.pendingTileReveals.delete(request.tileKey);
      return false;
    });

    for (const [tileKey, inFlight] of [...this.inFlightImageLoads.entries()]) {
      if (this.isTileRequired(tileKey)) {
        continue;
      }
      const state = this.getTileState(inFlight.paint, inFlight.index);
      if (state.lastRequestKey === inFlight.requestKey && state.state === 'loading') {
        this.setTileState(inFlight.paint, inFlight.index, {
          ...state,
          state: 'idle',
          cancelledAt: performance.now(),
        });
      }
      this.pendingTileReveals.delete(tileKey);
      this.removeLoadingIndex(inFlight.paint, inFlight.index);
      this.releaseInFlightTileLoad(tileKey, { silent: true });
    }
  }

  private getCompositeRenderOptions(paint: SingleImage | TiledImage) {
    return paint.__parent?.renderOptions;
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

  private isLayerActive(paint: SingleImage | TiledImage): boolean {
    const parent = paint.__parent as any;
    if (!parent) {
      return true;
    }
    if (typeof parent.isImageActive === 'function') {
      return !!parent.isImageActive(paint);
    }
    return true;
  }

  private shouldDrawLayer(paint: SingleImage | TiledImage, index: number, isActiveLayer: boolean): boolean {
    const policy = this.getCompositeRenderOptions(paint)?.layerPolicy || 'fallback-only';
    if (policy === 'active-only') {
      if (isActiveLayer) {
        return true;
      }
      const texture = paint.__host?.webgl?.texture ? paint.__host.webgl.texture : paint.__host?.webgl?.textures?.[index];
      return !!texture;
    }
    return true;
  }

  private getFadeAlpha(paint: SingleImage | TiledImage, index: number, isActiveLayer: boolean): number {
    if (this.getTileState(paint, index).skipFade) {
      return 1;
    }

    const isRevealDeferred =
      this.getTileState(paint, index).state === 'decoded' &&
      !paint.__host?.webgl?.loadedAt?.[index] &&
      (this.imageLoadingConfig.revealDelayFrames > 0 || this.imageLoadingConfig.revealBatchWindowFrames > 0);
    if (isRevealDeferred) {
      return 0;
    }

    const options = this.getCompositeRenderOptions(paint);
    if (!options || !options.fadeInMs || options.fadeInMs <= 0) {
      return 1;
    }
    const loadedAt = paint.__host?.webgl?.loadedAt?.[index];
    if (!loadedAt) {
      return 1;
    }
    if (!isActiveLayer && !options.fadeFallbackTiles) {
      return 1;
    }
    const elapsed = performance.now() - loadedAt;
    return Math.max(0, Math.min(1, elapsed / options.fadeInMs));
  }

  private getTileRequestKey(paint: SingleImage | TiledImage, index: number): string {
    return `${paint.id}::${paint.display.scale}::${index}`;
  }

  private enqueueTileRequest(
    paint: SingleImage | TiledImage,
    index: number,
    priority: number,
    prefetch: boolean
  ): boolean {
    if (!paint.getImageUrl || !paint.__host?.webgl) {
      return false;
    }

    const tileKey = this.getTileKey(paint, index);
    this.markTileRequired(tileKey, prefetch);

    const texture = paint.__host.webgl.texture ? paint.__host.webgl.texture : paint.__host.webgl.textures?.[index];
    if (texture) {
      return false;
    }

    if (paint.__host.webgl.loading && paint.__host.webgl.loading.indexOf(index) !== -1) {
      return false;
    }

    const tileState = this.getTileState(paint, index);
    const now = performance.now();
    if (tileState.nextRetryAt && tileState.nextRetryAt > now) {
      return false;
    }

    const key = this.getTileRequestKey(paint, index);
    if (this.queuedTileRequestKeys.has(key)) {
      return false;
    }

    const requestKey = this.nextRequestKey(tileKey);
    this.pendingTileReveals.delete(tileKey);
    this.setTileState(paint, index, {
      ...tileState,
      state: 'queued',
      requestedAt: now,
      lastRequestKey: requestKey,
      cancelledAt: undefined,
      error: undefined,
      skipFade: false,
    });

    this.tileRequestQueue.push({
      key,
      tileKey,
      requestKey,
      paint,
      index,
      url: paint.getImageUrl(index),
      priority,
      prefetch,
    });
    this.queuedTileRequestKeys.add(key);
    this.requiresRepaint = true;
    return true;
  }

  private schedulePrefetchNeighbours(paint: TiledImage, index: number, priority: number) {
    if (this.framePrefetchCount >= this.maxPrefetchPerFrame) {
      return;
    }

    const options = this.getCompositeRenderOptions(paint);
    if (options?.loadingBias === 'data') {
      return;
    }

    const radius = this.getPrefetchRadius(paint);
    if (radius <= 0 || !paint.columns || !paint.rows) {
      return;
    }

    const x = index % paint.columns;
    const y = Math.floor(index / paint.columns);

    for (let ring = 1; ring <= radius; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
            continue;
          }

          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= paint.columns || ny >= paint.rows) {
            continue;
          }

          const neighbourIndex = ny * paint.columns + nx;
          if (this.enqueueTileRequest(paint, neighbourIndex, priority + ring * 1000, true)) {
            this.framePrefetchCount++;
            if (this.framePrefetchCount >= this.maxPrefetchPerFrame) {
              return;
            }
          }
        }
      }
    }
  }

  private processTileQueue() {
    if (!this.tileRequestQueue.length) {
      return;
    }

    this.tileRequestQueue.sort((a, b) => {
      if (a.prefetch !== b.prefetch) {
        return a.prefetch ? 1 : -1;
      }
      return a.priority - b.priority;
    });

    while (this.loadingCount < this.maxConcurrentTasks && this.tileRequestQueue.length) {
      const next = this.tileRequestQueue.shift() as WebGLTileRequest;
      this.queuedTileRequestKeys.delete(next.key);

      const host = next.paint.__host?.webgl;
      if (!host || !next.paint.getImageUrl) {
        continue;
      }

      const state = this.getTileState(next.paint, next.index);
      if (state.lastRequestKey !== next.requestKey) {
        continue;
      }

      const texture = host.texture ? host.texture : host.textures?.[next.index];
      if (texture) {
        continue;
      }
      if (host.loading && host.loading.indexOf(next.index) !== -1) {
        continue;
      }

      this.setTileState(next.paint, next.index, {
        ...state,
        state: 'loading',
        url: next.url,
        requestedAt: state.requestedAt || performance.now(),
      });
      host.loading.push(next.index);
      this.loadingCount++;
      this.requiresRepaint = true;

      const consumerId = `${next.tileKey}::${next.requestKey}`;
      const acquired = this.imageRequestPool.acquire(next.url, consumerId);
      this.inFlightImageLoads.set(next.tileKey, {
        tileKey: next.tileKey,
        requestKey: next.requestKey,
        consumerId,
        paint: next.paint,
        index: next.index,
        release: acquired.release,
      });

      acquired.promise
        .then((image) => {
          this.releaseInFlightTileLoad(next.tileKey, { silent: true });
          const currentState = this.getTileState(next.paint, next.index);
          if (currentState.lastRequestKey !== next.requestKey || currentState.state !== 'loading') {
            this.removeLoadingIndex(next.paint, next.index);
            return;
          }
          next.paint.__host?.webgl?.onLoad(next.index, image);
        })
        .catch((error) => {
          this.releaseInFlightTileLoad(next.tileKey, { silent: true });
          if (isImageRequestCancelledError(error)) {
            const cancelledState = this.getTileState(next.paint, next.index);
            if (cancelledState.lastRequestKey === next.requestKey) {
              this.setTileState(next.paint, next.index, {
                ...cancelledState,
                state: 'idle',
                cancelledAt: performance.now(),
              });
            }
            this.pendingTileReveals.delete(next.tileKey);
            this.removeLoadingIndex(next.paint, next.index);
            return;
          }

          const failedState = this.getTileState(next.paint, next.index);
          if (failedState.lastRequestKey !== next.requestKey) {
            this.removeLoadingIndex(next.paint, next.index);
            return;
          }

          const attempts = (failedState.attempts || 0) + 1;
          const willRetry = attempts < this.imageLoadingConfig.maxAttempts;
          const nextRetryAt = willRetry
            ? performance.now() + getRetryDelayMs(this.imageLoadingConfig, attempts)
            : performance.now() + this.imageLoadingConfig.errorRetryIntervalMs;

          this.setTileState(next.paint, next.index, {
            ...failedState,
            state: willRetry ? 'idle' : 'error',
            attempts,
            nextRetryAt,
            error,
          });
          this.pendingTileReveals.delete(next.tileKey);
          this.removeLoadingIndex(next.paint, next.index);

          this.emitImageError({
            severity: 'recoverable',
            imageUrl: next.url,
            contentId: next.paint.id,
            tileIndex: next.index,
            attempt: attempts,
            maxAttempts: this.imageLoadingConfig.maxAttempts,
            willRetry,
            nextRetryAt,
            error,
          });

          if (!willRetry && this.options.fallbackOnImageLoadError) {
            this.emitFatalImageError({
              reason: 'image-cors-or-load',
              imageUrl: next.url,
              contentId: next.paint.id,
              tileIndex: next.index,
              error,
            });
          }
        })
        .finally(() => {
          this.processTileQueue();
        });
    }
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    if (paint.type !== 'spacial-content') {
      return;
    }
    if (!paint.__host || !paint.__host.webgl) {
      return;
    }

    const imagePaint = paint instanceof SingleImage || paint instanceof TiledImage;
    if (imagePaint && !isWebGLImageFastPathCandidate(paint, index)) {
      return;
    }
    if (imagePaint) {
      this.frameSawFastPathCandidate = true;
    }
    const isActiveLayer = imagePaint ? this.isLayerActive(paint) : true;

    if (paint.getTexture) {
      const newText = paint.getTexture();
      if (newText && paint.__host.webgl.lastImage !== newText.hash && newText.source && !paint.__host.webgl.error) {
        try {
          const level = 0;
          const internalFormat = this.gl.RGBA;
          const srcFormat = this.gl.RGBA;
          const srcType = this.gl.UNSIGNED_BYTE;
          this.gl.bindTexture(this.gl.TEXTURE_2D, paint.__host.webgl.texture);
          this.gl.texImage2D(this.gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, newText.source);
          paint.__host.webgl.lastImage = newText.hash;
        } catch (error) {
          paint.__host.webgl.error = error;
          this.emitFatalImageError({
            reason: 'teximage-security',
            contentId: paint.id,
            tileIndex: index,
            error,
          });
        }
      }
    }

    const texture = paint.__host.webgl.texture ? paint.__host.webgl.texture : paint.__host.webgl.textures[index];
    if (imagePaint && isActiveLayer) {
      const canvasCenterX = this.gl.canvas.width / this.dpi / 2;
      const canvasCenterY = this.gl.canvas.height / this.dpi / 2;
      const tileCenterX = x + width / 2;
      const tileCenterY = y + height / 2;
      const priority = Math.hypot(tileCenterX - canvasCenterX, tileCenterY - canvasCenterY);

      if (!texture) {
        this.enqueueTileRequest(paint, index, priority, false);
      }
      if (paint instanceof TiledImage) {
        this.schedulePrefetchNeighbours(paint, index, priority);
      }
    }

    if (imagePaint && !this.shouldDrawLayer(paint, index, isActiveLayer)) {
      return;
    }

    if (texture) {
      const baseAlpha = imagePaint ? (typeof paint.style?.opacity === 'number' ? paint.style.opacity : 1) : 1;
      if (!baseAlpha) {
        return;
      }
      const fadeAlpha = imagePaint ? this.getFadeAlpha(paint, index, isActiveLayer) : 1;
      if (fadeAlpha < 1) {
        this.hasTilesFading = true;
      }
      const alpha = baseAlpha * fadeAlpha;

      this.gl.enableVertexAttribArray(this.attributes.texCoord);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
      this.gl.enableVertexAttribArray(this.attributes.texCoord);
      this.gl.vertexAttribPointer(this.attributes.texCoord, 2, this.gl.FLOAT, false, 0, 0);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
      this.gl.enableVertexAttribArray(this.attributes.position);
      this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);

      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.uniform1i(this.uniforms.texture, 0);
      this.gl.uniform1f(this.uniforms.alpha, alpha);
      this.setRectangle(x, y, width, height);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
      if (!this.isImmediateReadiness() && imagePaint && alpha > 0) {
        this.firstMeaningfulPaint = true;
      }
    }
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand) {
    // no-op
  }

  pendingUpdate(): boolean {
    return (
      this.requiresRepaint ||
      this.tileRequestQueue.length > 0 ||
      this.loadingCount > 0 ||
      this.inFlightImageLoads.size > 0 ||
      this.pendingTileReveals.size > 0 ||
      this.hasTilesFading
    );
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  afterFrame() {
    this.pruneStaleTileWork();
    this.processTileQueue();
  }

  lastKnownScale = 1;

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

  getCanvasDims() {
    return { width: this.canvas.width / this.dpi, height: this.canvas.height / this.dpi };
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    return null;
  }

  // Helpers.
  createShader(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (shader) {
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      const success = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
      if (success) {
        return shader;
      }

      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      if (info) {
        throw new Error(info);
      }
    }

    throw new Error('Invalid shader');
  }

  createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    const program = this.gl.createProgram();
    if (program) {
      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);
      const success = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
      if (success) {
        return program;
      }

      const info = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      if (info) {
        throw new Error(info);
      }
    }
    throw new Error('Invalid program');
  }

  resizeCanvasToDisplaySize() {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    // Lookup the size the browser is displaying the canvas in CSS pixels.
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const targetWidth = Math.round(displayWidth * this.dpi);
    const targetHeight = Math.round(displayHeight * this.dpi);

    // Check if the canvas is not the same size.
    const needResize = canvas.width !== targetWidth || canvas.height !== targetHeight;

    if (needResize) {
      // Make the canvas the same size
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    return needResize;
  }

  createArrayBuffer(data?: Float32Array) {
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    if (data) {
      this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    }

    if (!buffer) {
      throw new Error('Cannot create buffer');
    }
    return buffer;
  }

  setRectangle(x: number, y: number, width: number, height: number) {
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.getRectangle(x, y, width, height), this.gl.STATIC_DRAW);
  }

  getRectangle(x: number, y: number, width: number, height: number) {
    const x1 = x;
    const x2 = x + width;
    const y1 = y;
    const y2 = y + height;
    this.rectBuffer.set([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]);
    return this.rectBuffer;
  }

  getRendererScreenPosition() {
    return this.rendererPosition;
  }

  finishLayer() {}
  resetReadyState() {
    if (this.isImmediateReadiness()) {
      return;
    }
    this.firstMeaningfulPaint = false;
  }

  reset() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.style.filter = 'none';
    this.framePrefetchCount = 0;
    this.loadingCount = 0;
    this.hasTilesFading = false;
    this.requiresRepaint = false;
    this.tileRequestQueue = [];
    this.queuedTileRequestKeys.clear();
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
    this.frameSawFastPathCandidate = false;
    this.firstMeaningfulPaint = this.isImmediateReadiness();
  }
}
