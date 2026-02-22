/** @vitest-environment happy-dom */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { WebGLRenderer } from '../../modules/webgl-renderer/webgl-renderer';
import { ImageTexture } from '../../spacial-content/image-texture';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';

function createMockCanvas() {
  return {
    width: 0,
    height: 0,
    clientWidth: 100,
    clientHeight: 100,
    style: { filter: '' },
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: 100,
      height: 100,
    }),
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
    BLEND: 20,
    SRC_ALPHA: 21,
    ONE_MINUS_SRC_ALPHA: 22,
    SCISSOR_TEST: 23,
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
    scissor: vi.fn(),
    useProgram: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    blendFunc: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    uniform1i: vi.fn(),
    drawArrays: vi.fn(),
  } as any;
}

const defaultHookOptions = {
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
};

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

  test('emits recoverable image error without fallback when image request fails', async () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const onFatalImageError = vi.fn();
    const onImageError = vi.fn();
    const renderer = new WebGLRenderer(canvas, {
      onFatalImageError,
      onImageError,
      imageLoading: { maxAttempts: 1, errorRetryIntervalMs: 5000 },
    });
    vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
      requestKey: 'test',
      release: vi.fn(),
      promise: Promise.reject(new Error('load failed')),
    });
    const image = new SingleImage();
    image.applyProps({
      uri: 'https://example.com/no-cors.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    });

    renderer.prepareLayer(image);
    renderer.paint(image, 0, 0, 0, 100, 100);
    renderer.afterFrame();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFatalImageError).not.toHaveBeenCalled();
    expect(onImageError).toHaveBeenCalledTimes(1);
    expect(onImageError.mock.calls[0][0].renderer).toBe('webgl');
    expect(onImageError.mock.calls[0][0].severity).toBe('recoverable');
    expect(onImageError.mock.calls[0][0].contentId).toBe(image.id);
    expect(onImageError.mock.calls[0][0].willRetry).toBe(false);
  });

  test('can preserve legacy image-load fallback behaviour when enabled', async () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const onFatalImageError = vi.fn();
    const renderer = new WebGLRenderer(canvas, {
      onFatalImageError,
      fallbackOnImageLoadError: true,
      imageLoading: { maxAttempts: 1 },
    });
    vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
      requestKey: 'test',
      release: vi.fn(),
      promise: Promise.reject(new Error('load failed')),
    });

    const image = new SingleImage();
    image.applyProps({
      uri: 'https://example.com/no-cors.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    });

    renderer.prepareLayer(image);
    renderer.paint(image, 0, 0, 0, 100, 100);
    renderer.afterFrame();
    await Promise.resolve();
    await Promise.resolve();

    expect(onFatalImageError).toHaveBeenCalledTimes(1);
    expect(onFatalImageError.mock.calls[0][0].reason).toBe('image-cors-or-load');
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
      ...defaultHookOptions,
    });

    expect(gl.uniform2f).toHaveBeenCalledWith(renderer.uniforms.resolution, 120, 80);
  });

  test('keeps pending update while tile alpha fade is in progress', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const image = new SingleImage();
    image.applyProps({
      id: 'fade-image',
      uri: 'https://example.com/fade.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);
    image.__parent = {
      renderOptions: {
        layerPolicy: 'fallback-only',
        fadeInMs: 1000,
        fadeFallbackTiles: false,
      },
      isImageActive: () => true,
    } as any;

    renderer.prepareLayer(image);
    image.__host.webgl.textures[0] = {};
    image.__host.webgl.loadedAt[0] = performance.now() - 10;

    renderer.beforeFrame({} as any, 16, {} as any, {
      ...defaultHookOptions,
    });
    renderer.paint(image, 0, 0, 0, 100, 100);

    expect(gl.uniform1f).toHaveBeenCalled();
    const alphaArg = gl.uniform1f.mock.calls[gl.uniform1f.mock.calls.length - 1][1];
    expect(alphaArg).toBeLessThan(1);
    expect(renderer.pendingUpdate()).toBe(true);
  });

  test('fades a newly active layer even when the texture was decoded earlier', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const image = new SingleImage();
    image.applyProps({
      id: 'active-layer-fade',
      uri: 'https://example.com/active-layer-fade.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);
    image.__parent = {
      renderOptions: {
        layerPolicy: 'fallback-only',
        fadeInMs: 1000,
        fadeFallbackTiles: false,
        fadeOnLayerChange: true,
      },
      isImageActive: () => true,
      getImageActivatedAt: () => performance.now() - 20,
    } as any;

    renderer.prepareLayer(image);
    image.__host.webgl.textures[0] = {};
    image.__host.webgl.loadedAt[0] = performance.now() - 5000;

    renderer.beforeFrame({} as any, 16, {} as any, {
      ...defaultHookOptions,
    });
    renderer.paint(image, 0, 0, 0, 100, 100);

    const alphaArg = gl.uniform1f.mock.calls[gl.uniform1f.mock.calls.length - 1][1];
    expect(alphaArg).toBeLessThan(1);
    expect(renderer.pendingUpdate()).toBe(true);
  });

  test('clips composite layers to parent bounds when clipToBounds is enabled', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const image = new SingleImage();
    image.applyProps({
      id: 'clip-layer',
      uri: 'https://example.com/clip-layer.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);
    image.__parent = {
      renderOptions: {
        layerPolicy: 'fallback-only',
        clipToBounds: true,
      },
      isImageActive: () => true,
    } as any;

    renderer.prepareLayer(image, new Float32Array([1, 5, 10, 45, 50]) as any);

    expect(gl.enable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
    expect(gl.scissor).toHaveBeenCalledWith(5, 50, 40, 40);

    renderer.finishLayer();
    expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
  });

  test('does not request inactive layers but still draws cached fallback textures', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const acquire = vi.spyOn((renderer as any).imageRequestPool, 'acquire');
    const image = new SingleImage();
    image.applyProps({
      id: 'inactive-image',
      uri: 'https://example.com/inactive.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);
    image.__parent = {
      renderOptions: {
        layerPolicy: 'fallback-only',
      },
      isImageActive: () => false,
    } as any;

    renderer.prepareLayer(image);
    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);
    renderer.afterFrame();

    expect(acquire).not.toHaveBeenCalled();
    expect(gl.drawArrays).not.toHaveBeenCalled();

    image.__host.webgl.textures[0] = {};
    renderer.paint(image, 0, 0, 0, 100, 100);

    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });

  test('caps prefetch and concurrent active tile requests', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const acquire = vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockImplementation(() => ({
      requestKey: 'test',
      release: vi.fn(),
      promise: new Promise(() => {}),
    }));
    const image = TiledImage.fromTile(
      'https://example.org/tiled-image',
      { width: 512, height: 512 },
      { width: 128, height: 128 },
      1
    );
    image.__parent = {
      renderOptions: {
        layerPolicy: 'fallback-only',
        loadingBias: 'speed',
        prefetchRadius: 2,
      },
      isImageActive: () => true,
    } as any;

    renderer.prepareLayer(image);
    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 5, 0, 0, 100, 100);

    expect((renderer as any).tileRequestQueue.length).toBe(9);

    renderer.afterFrame();
    expect(acquire).toHaveBeenCalledTimes(6);
    expect((renderer as any).loadingCount).toBe(6);
    expect((renderer as any).tileRequestQueue.length).toBe(3);
  });

  test('holds decoded textures until batched reveal frame', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, {
      dpi: 1,
      imageLoading: { revealDelayFrames: 1, revealBatchWindowFrames: 1 },
    });
    const image = new SingleImage();
    image.applyProps({
      id: 'batched-reveal',
      uri: 'https://example.com/batched.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);

    renderer.prepareLayer(image);
    image.__host.webgl.textures[0] = {};
    image.__host.webgl.loadedAt[0] = undefined;
    image.__host.webgl.tileState[0] = { state: 'decoded' };
    (renderer as any).pendingTileReveals.set(`${image.id}::${image.display.scale}::0`, {
      paint: image,
      index: 0,
      queuedFrame: 0,
    });

    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    expect(image.__host.webgl.loadedAt[0]).toBeTypeOf('number');
  });

  test('pendingUpdate stays true while reveal batching is queued', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, {
      dpi: 1,
      imageLoading: { revealDelayFrames: 2, revealBatchWindowFrames: 1 },
    });
    const image = new SingleImage();
    image.applyProps({
      id: 'queued-reveal',
      uri: 'https://example.com/queued.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);

    renderer.prepareLayer(image);
    image.__host.webgl.textures[0] = {};
    image.__host.webgl.loadedAt[0] = undefined;
    image.__host.webgl.tileState[0] = { state: 'decoded' };
    (renderer as any).pendingTileReveals.set(`${image.id}::${image.display.scale}::0`, {
      paint: image,
      index: 0,
      queuedFrame: 1,
    });

    expect(renderer.pendingUpdate()).toBe(true);
  });

  test('active-only keeps loaded fallback layers visible while inactive', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const image = new SingleImage();
    image.applyProps({
      id: 'active-only-fallback',
      uri: 'https://example.com/fallback.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);
    image.__parent = {
      renderOptions: {
        layerPolicy: 'active-only',
        fadeInMs: 0,
      },
      isImageActive: () => false,
    } as any;

    renderer.prepareLayer(image);
    image.__host.webgl.textures[0] = {};

    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);

    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
  });

  test('skips fade for quickly loaded textures', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, {
      dpi: 1,
      imageLoading: { skipFadeIfLoadedWithinMs: 500 },
    });
    const image = new SingleImage();
    image.applyProps({
      id: 'quick-webgl',
      uri: 'https://example.com/quick.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);
    image.__parent = {
      renderOptions: {
        layerPolicy: 'fallback-only',
        fadeInMs: 1000,
      },
      isImageActive: () => true,
    } as any;

    renderer.prepareLayer(image);
    image.__host.webgl.textures[0] = {};
    image.__host.webgl.loadedAt[0] = performance.now();
    image.__host.webgl.tileState[0] = {
      state: 'decoded',
      requestedAt: performance.now() - 15,
      skipFade: true,
    };

    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);

    const alphaArg = gl.uniform1f.mock.calls[gl.uniform1f.mock.calls.length - 1][1];
    expect(alphaArg).toBe(1);
  });

  test('default readiness waits for first meaningful fast-path paint', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const image = new SingleImage();
    image.applyProps({
      id: 'ready-default',
      uri: 'https://example.com/ready-default.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);

    renderer.prepareLayer(image);

    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(renderer.isReady()).toBe(false);

    image.__host.webgl.textures[0] = {};
    (renderer as any).tileRequestQueue = [];
    (renderer as any).loadingCount = 0;
    (renderer as any).inFlightImageLoads.clear();
    (renderer as any).pendingTileReveals.clear();

    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(renderer.isReady()).toBe(true);
  });

  test('resetReadyState re-arms meaningful-ready transition for webgl images', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, { dpi: 1 });
    const image = new SingleImage();
    image.applyProps({
      id: 'ready-reset',
      uri: 'https://example.com/ready-reset.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);
    renderer.prepareLayer(image);

    image.__host.webgl.textures[0] = {};
    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(renderer.isReady()).toBe(true);

    renderer.resetReadyState();
    image.__host.webgl.textures[0] = undefined;
    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(renderer.isReady()).toBe(false);
  });

  test('immediate readiness mode remains ready before image draw and after reset', () => {
    const canvas = createMockCanvas();
    const gl = createMockGL(canvas);
    canvas.getContext = vi.fn((type) => {
      if (type === 'webgl2') {
        return gl;
      }
      return null as any;
    });

    const renderer = new WebGLRenderer(canvas, {
      dpi: 1,
      readiness: 'immediate',
    });
    expect(renderer.isReady()).toBe(true);

    renderer.resetReadyState();
    expect(renderer.isReady()).toBe(true);
  });
});
