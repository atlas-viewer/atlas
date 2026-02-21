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

export type { AtlasWebGLFallbackEvent, AtlasWebGLFallbackReason } from './types';

export type WebGLRendererOptions = {
  dpi?: number;
  onFatalImageError?: (event: AtlasWebGLFallbackEvent) => void;
};

type WebGLTileRequest = {
  key: string;
  paint: SingleImage | TiledImage;
  index: number;
  url: string;
  priority: number;
  prefetch: boolean;
};

const imageCache: { [id: string]: HTMLImageElement } = {};

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
  framePrefetchCount = 0;
  loadingCount = 0;
  hasTilesFading = false;
  requiresRepaint = true;
  tileRequestQueue: WebGLTileRequest[] = [];
  queuedTileRequestKeys = new Set<string>();
  inFlightImageLoads = new Map<string, Promise<HTMLImageElement>>();
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
    return true;
  }

  beforeFrame(world: World, delta: number, target: Strand, options: HookOptions) {
    this.hasTilesFading = false;
    this.requiresRepaint = false;
    this.framePrefetchCount = 0;

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
        paint.__host.webgl.loadedAt[index] = performance.now();
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

  private shouldDrawLayer(paint: SingleImage | TiledImage, isActiveLayer: boolean): boolean {
    const policy = this.getCompositeRenderOptions(paint)?.layerPolicy || 'fallback-only';
    if (policy === 'active-only') {
      return isActiveLayer;
    }
    return true;
  }

  private getFadeAlpha(paint: SingleImage | TiledImage, index: number, isActiveLayer: boolean): number {
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

  private loadImageOnce(url: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = document.createElement('img');
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        image.onload = null;
        image.onerror = null;
        resolve(image);
      };
      image.onerror = (error) => {
        image.onload = null;
        image.onerror = null;
        reject(error);
      };
      image.src = url;
      if (image.complete && image.naturalWidth > 0) {
        image.onload = null;
        image.onerror = null;
        resolve(image);
      }
    });
  }

  private requestImage(url: string): Promise<HTMLImageElement> {
    if (imageCache[url] && imageCache[url].naturalWidth > 0) {
      return Promise.resolve(imageCache[url]);
    }

    const inFlight = this.inFlightImageLoads.get(url);
    if (inFlight) {
      return inFlight;
    }

    let request: Promise<HTMLImageElement>;
    request = this.loadImageOnce(url)
      .then((image) => {
        imageCache[url] = image;
        return image;
      })
      .finally(() => {
        if (this.inFlightImageLoads.get(url) === request) {
          this.inFlightImageLoads.delete(url);
        }
      });
    this.inFlightImageLoads.set(url, request);
    return request;
  }

  private getTileRequestKey(paint: SingleImage | TiledImage, index: number): string {
    return `${paint.id}::${index}`;
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

    const texture = paint.__host.webgl.texture ? paint.__host.webgl.texture : paint.__host.webgl.textures?.[index];
    if (texture) {
      return false;
    }

    if (paint.__host.webgl.loading && paint.__host.webgl.loading.indexOf(index) !== -1) {
      return false;
    }

    const key = this.getTileRequestKey(paint, index);
    if (this.queuedTileRequestKeys.has(key)) {
      return false;
    }

    this.tileRequestQueue.push({
      key,
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

      const texture = host.texture ? host.texture : host.textures?.[next.index];
      if (texture) {
        continue;
      }
      if (host.loading && host.loading.indexOf(next.index) !== -1) {
        continue;
      }

      host.loading.push(next.index);
      this.loadingCount++;
      this.requiresRepaint = true;

      this.requestImage(next.url)
        .then((image) => {
          next.paint.__host?.webgl?.onLoad(next.index, image);
        })
        .catch((error) => {
          this.removeLoadingIndex(next.paint, next.index);
          this.emitFatalImageError({
            reason: 'image-cors-or-load',
            imageUrl: next.url,
            contentId: next.paint.id,
            tileIndex: next.index,
            error,
          });
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

    if ((paint instanceof SingleImage || paint instanceof TiledImage) && !isWebGLImageFastPathCandidate(paint, index)) {
      return;
    }
    const imagePaint = paint instanceof SingleImage || paint instanceof TiledImage;
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

    if (imagePaint && !this.shouldDrawLayer(paint, isActiveLayer)) {
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
      this.hasTilesFading
    );
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  afterFrame() {
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
  reset() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost as EventListener);
    this.canvas.style.filter = 'none';
    this.framePrefetchCount = 0;
    this.loadingCount = 0;
    this.hasTilesFading = false;
    this.requiresRepaint = false;
    this.tileRequestQueue = [];
    this.queuedTileRequestKeys.clear();
    this.inFlightImageLoads.clear();
  }
}
