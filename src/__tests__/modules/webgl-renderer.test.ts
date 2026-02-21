/** @vitest-environment happy-dom */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { WebGLRenderer } from '../../modules/webgl-renderer/webgl-renderer';
import { SingleImage } from '../../spacial-content/single-image';
import { ImageTexture } from '../../spacial-content/image-texture';

function createMockCanvas() {
  return {
    width: 0,
    height: 0,
    clientWidth: 100,
    clientHeight: 100,
    style: { filter: '' },
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 100, height: 100 }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getContext: vi.fn(),
  } as any as HTMLCanvasElement;
}

function createMockGL(canvas: HTMLCanvasElement) {
  return {
    FRAGMENT_SHADER: 1,
    VERTEX_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    COLOR_BUFFER_BIT: 7,
    TEXTURE_2D: 8,
    UNPACK_FLIP_Y_WEBGL: 9,
    RGBA: 10,
    UNSIGNED_BYTE: 11,
    TEXTURE_MAG_FILTER: 12,
    TEXTURE_MIN_FILTER: 13,
    TEXTURE_WRAP_T: 14,
    TEXTURE_WRAP_S: 15,
    LINEAR: 16,
    CLAMP_TO_EDGE: 17,
    FLOAT: 18,
    TRIANGLES: 19,
    canvas,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    useProgram: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform2f: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1i: vi.fn(),
    drawArrays: vi.fn(),
  } as any;
}

describe('WebGLRenderer fallback events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('emits webgl-context-unavailable when context creation fails', () => {
    const canvas = createMockCanvas();
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return null;
      }
      return null as any;
    });

    const onFatalImageError = vi.fn();
    expect(() => {
      new WebGLRenderer(canvas, { onFatalImageError });
    }).toThrow('WebGL2 context unavailable');

    expect(onFatalImageError).toHaveBeenCalledTimes(1);
    expect(onFatalImageError.mock.calls[0][0].reason).toBe('webgl-context-unavailable');
  });

  test('emits image-cors-or-load from image onerror path', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const originalCreateElement = document.createElement.bind(document);
    let createdImg: HTMLImageElement | null = null;
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const el = originalCreateElement(tagName as any) as any;
      if (tagName.toLowerCase() === 'img') {
        createdImg = el;
      }
      return el;
    }) as any);

    const onFatalImageError = vi.fn();
    const renderer = new WebGLRenderer(canvas, { onFatalImageError });
    const image = new SingleImage();
    image.applyProps({
      uri: 'https://example.com/no-cors.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    });

    renderer.prepareLayer(image);
    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(createdImg).toBeTruthy();
    createdImg!.onerror?.(new Event('error') as any);

    expect(onFatalImageError).toHaveBeenCalledTimes(1);
    expect(onFatalImageError.mock.calls[0][0].reason).toBe('image-cors-or-load');
    expect(onFatalImageError.mock.calls[0][0].contentId).toBe(image.id);
  });

  test('emits teximage-security when texImage2D throws', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    gl.texImage2D = vi.fn(() => {
      throw new Error('SecurityError');
    });
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const onFatalImageError = vi.fn();
    const renderer = new WebGLRenderer(canvas, { onFatalImageError });
    const texture = new ImageTexture();
    texture.applyProps({
      id: 'texture-1',
      target: { width: 64, height: 64 },
      getTexture: () => ({ source: document.createElement('canvas'), hash: 1 }),
    });

    renderer.prepareLayer(texture);

    expect(onFatalImageError).toHaveBeenCalledTimes(1);
    expect(onFatalImageError.mock.calls[0][0].reason).toBe('teximage-security');
    expect(onFatalImageError.mock.calls[0][0].contentId).toBe('texture-1');
  });

  test('uses HiDPI backing size with CSS-space resolution uniform', () => {
    const canvas = createMockCanvas();
    canvas.clientWidth = 120;
    canvas.clientHeight = 80;
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 2 });
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);

    renderer.beforeFrame({} as any, 16, {} as any, {
      filters: {
        grayscale: 0,
        contrast: 0,
        brightness: 0,
        saturate: 0,
        sepia: 0,
        invert: 0,
        hueRotate: 0,
        blur: 0,
      },
      enableFilters: false,
    });

    expect(gl.uniform2f).toHaveBeenCalledWith(renderer.uniforms.resolution, 120, 80);
  });
});
