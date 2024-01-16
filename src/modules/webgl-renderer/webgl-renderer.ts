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

export type WebGLRendererOptions = {
  dpi?: number;
};

export class WebGLRenderer implements Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;

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

  constructor(canvas: HTMLCanvasElement, options?: WebGLRendererOptions) {
    this.canvas = canvas;
    this.rendererPosition = canvas.getBoundingClientRect();
    this.gl = canvas.getContext('webgl2') as WebGL2RenderingContext;

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

    // @todo change.
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(this.program);
    this.gl.enableVertexAttribArray(this.attributes.position);
  }

  resize() {
    this.resizeCanvasToDisplaySize();
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    this.rendererPosition = this.canvas.getBoundingClientRect();
  }

  isReady() {
    return true;
  }

  beforeFrame(world: World, delta: number, target: Strand) {
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.vertexAttribPointer(this.attributes.position, 2, this.gl.FLOAT, false, 0, 0);
    this.gl.uniform2f(this.uniforms.resolution, this.gl.canvas.width, this.gl.canvas.height);
    if (this.lastResize > 1000) {
      this.lastResize = 0;
      this.resizeCanvasToDisplaySize();
    }
    this.lastResize += delta;
  }

  lastResize = 0;

  prepareLayer(paint: SpacialContent) {
    // no-op.
    if (!paint.__host || !paint.__host.webgl) {
      if (paint instanceof SingleImage || paint instanceof TiledImage) {
        // create it if it does not exist.
        this.createImageHost(paint);
      }
      if (paint instanceof ImageTexture) {
        this.createTextureHost(paint);
      }
      // if (paint instanceof Box) {
      //   this.createTextureHost(paint);
      // }
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, initial.source);
      }
      lastImage = initial;
    } else {
      // @todo draw box and set webgl.updateTexture function.
      // const data = paint.props.backgroundColor === 'red' ? new Uint8Array([255, 0, 0]) : new Uint8Array([0, 0, 255]);
      // const alignment = 1;
      // gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);
      // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, data);
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        paint.__host.webgl.textures[index] = texture;
        paint.__host.webgl.loaded.push(index);
      },
    };
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    if (paint.type === 'spacial-content') {
      if (paint.__host && paint.__host.webgl) {
        if (paint.getTexture) {
          const newText = paint?.getTexture();
          if (newText && paint.__host.webgl.lastImage !== newText.hash && newText.source && !paint.__host.webgl.error) {
            try {
              const level = 0;
              const internalFormat = this.gl.RGBA;
              const srcFormat = this.gl.RGBA;
              const srcType = this.gl.UNSIGNED_BYTE;
              this.gl.bindTexture(this.gl.TEXTURE_2D, paint.__host.webgl.texture);
              this.gl.texImage2D(this.gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, newText.source);
              paint.__host.webgl.lastImage = newText.hash;
            } catch (e) {
              paint.__host.webgl.error = e;
            }
          }
        }

        if (paint.__host.webgl.loading && paint.__host.webgl.loading.indexOf(index) === -1 && paint.getImageUrl) {
          paint.__host.webgl.loading.push(index);
          const image = document.createElement('img');
          image.decoding = 'async';
          image.crossOrigin = 'anonymous';
          image.src = paint.getImageUrl(index);
          image.onload = () => {
            image.onload = null;
            return paint.__host.webgl.onLoad(index, image);
          };
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

    // Check if the canvas is not the same size.
    const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;

    if (needResize) {
      // Make the canvas the same size
      canvas.width = displayWidth;
      canvas.height = displayHeight;
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
  reset() {}
}
