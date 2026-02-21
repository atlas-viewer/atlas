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
    varying vec2 v_texCoord;

    void main() {
        gl_FragColor = texture2D(u_image, v_texCoord);
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
  };
  buffers: {
    position: WebGLBuffer;
    texCoord: WebGLBuffer;
  };
  rendererPosition: DOMRect;
  dpi: number;
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

    if (paint.__host.webgl.loading && paint.__host.webgl.loading.indexOf(index) === -1 && paint.getImageUrl) {
      paint.__host.webgl.loading.push(index);
      const imageUrl = paint.getImageUrl(index);
      const image = document.createElement('img');
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        image.onload = null;
        image.onerror = null;
        return paint.__host.webgl.onLoad(index, image);
      };
      image.onerror = (error) => {
        image.onload = null;
        image.onerror = null;
        this.removeLoadingIndex(paint, index);
        this.emitFatalImageError({
          reason: 'image-cors-or-load',
          imageUrl,
          contentId: paint.id,
          tileIndex: index,
          error,
        });
      };
      image.src = imageUrl;
    }

    const texture = paint.__host.webgl.texture ? paint.__host.webgl.texture : paint.__host.webgl.textures[index];
    if (texture) {
      this.gl.enableVertexAttribArray(this.attributes.texCoord);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoord);
      this.gl.enableVertexAttribArray(this.attributes.texCoord);
      this.gl.vertexAttribPointer(this.attributes.texCoord, 2, this.gl.FLOAT, false, 0, 0);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
      this.gl.enableVertexAttribArray(this.attributes.position);
      this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);

      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.uniform1i(this.uniforms.texture, 0);
      this.setRectangle(x, y, width, height);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand) {
    // no-op
  }

  pendingUpdate(): boolean {
    return true;
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  afterFrame() {
    // no-op.
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
  }
}
