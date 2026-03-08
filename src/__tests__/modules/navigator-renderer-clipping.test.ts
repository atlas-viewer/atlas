/** @vitest-environment happy-dom */

import { DnaFactory } from '@atlas-viewer/dna';
import { describe, expect, test, vi } from 'vitest';
import { NavigatorRenderer } from '../../modules/navigator-renderer/navigator-renderer';
import { SingleImage } from '../../spacial-content/single-image';

function createMockContext() {
  return {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as any;
}

function createMockCanvas(context: any, width = 100, height = 100): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: vi.fn(() => context),
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width, height }),
  } as any as HTMLCanvasElement;
}

describe('NavigatorRenderer clipping', () => {
  test('clips image layers to composite bounds when clipToBounds is enabled', () => {
    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const renderer = new NavigatorRenderer(canvas, { drawFallbackBoxes: false });
    const image = new SingleImage();
    image.applyProps({
      id: 'navigator-clip',
      uri: 'https://example.org/navigator-clip.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);
    image.__parent = {
      points: DnaFactory.singleBox(40, 40, 10, 20),
      renderOptions: {
        clipToBounds: true,
      },
    } as any;

    const preview = {} as HTMLImageElement;
    (renderer as any).previewImageCache.set(image.uri, {
      image: preview,
      status: 'loaded',
    });

    const world = {
      width: 100,
      height: 100,
      zones: [],
      getActiveZone: () => undefined,
      getPointsAt: () => [[image, DnaFactory.singleBox(80, 80, 0, 0), undefined]],
    } as any;
    const target = DnaFactory.singleBox(100, 100, 0, 0);

    renderer.beforeFrame(world);
    renderer.afterFrame(world, 16, target);

    expect(baseContext.rect).toHaveBeenCalledWith(10, 20, 40, 40);
    expect(baseContext.clip).toHaveBeenCalledTimes(1);
    expect(baseContext.restore).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  test('does not clip when composite clipToBounds is disabled', () => {
    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const renderer = new NavigatorRenderer(canvas, { drawFallbackBoxes: false });
    const image = new SingleImage();
    image.applyProps({
      id: 'navigator-no-clip',
      uri: 'https://example.org/navigator-no-clip.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);
    image.__parent = {
      points: DnaFactory.singleBox(40, 40, 10, 20),
      renderOptions: {
        clipToBounds: false,
      },
    } as any;

    (renderer as any).previewImageCache.set(image.uri, {
      image: {} as HTMLImageElement,
      status: 'loaded',
    });

    const world = {
      width: 100,
      height: 100,
      zones: [],
      getActiveZone: () => undefined,
      getPointsAt: () => [[image, DnaFactory.singleBox(80, 80, 0, 0), undefined]],
    } as any;
    const target = DnaFactory.singleBox(100, 100, 0, 0);

    renderer.beforeFrame(world);
    renderer.afterFrame(world, 16, target);

    expect(baseContext.clip).not.toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  test('marks cached-complete preview images as loaded and requests a render', () => {
    class ImmediatelyCompleteImage {
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: any = null;
      onerror: any = null;
      private _src = '';

      set src(value: string) {
        this._src = value;
        this.complete = true;
        this.naturalWidth = 512;
        this.naturalHeight = 512;
      }

      get src() {
        return this._src;
      }
    }

    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);
    const requestRender = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const OriginalImage = globalThis.Image;
    (globalThis as any).Image = ImmediatelyCompleteImage as any;

    try {
      const renderer = new NavigatorRenderer(canvas, {
        drawFallbackBoxes: false,
        onRequestRender: requestRender,
      });
      const imageUrl = 'https://example.org/navigator-cached-complete.jpg';
      const preview = (renderer as any).getLoadedPreviewImage(imageUrl);
      const cacheEntry = (renderer as any).previewImageCache.get(imageUrl);

      expect(cacheEntry.status).toBe('loaded');
      expect(preview).toBe(cacheEntry.image);
      expect(requestRender).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as any).Image = OriginalImage;
      createElementSpy.mockRestore();
    }
  });

  test('renders image paints from shared canvas renderer resources without creating preview images', () => {
    class ThrowingImage {
      constructor() {
        throw new Error('navigator preview loader should not run when shared canvas resources exist');
      }
    }

    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);
    const sharedTileCanvas = createMockCanvas(createMockContext());

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const OriginalImage = globalThis.Image;
    (globalThis as any).Image = ThrowingImage as any;

    try {
      const renderer = new NavigatorRenderer(canvas, {
        drawFallbackBoxes: false,
        sharedCanvasRenderer: {
          hostCache: {
            get: vi.fn((id: string) => (id === 'shared-tile-0' ? (sharedTileCanvas as any) : undefined)),
          },
          invalidated: [],
        } as any,
      });
      const image = new SingleImage();
      image.applyProps({
        id: 'navigator-shared-canvas',
        uri: 'https://example.org/navigator-shared-canvas.jpg',
        target: { width: 100, height: 100 },
        display: { width: 100, height: 100 },
      } as any);
      image.__host = {
        canvas: {
          canvases: ['shared-tile-0'],
          tiles: {
            0: { state: 'decoded' },
          },
        },
      } as any;

      const world = {
        width: 100,
        height: 100,
        zones: [],
        getActiveZone: () => undefined,
        getPointsAt: () => [[image, DnaFactory.singleBox(100, 100, 0, 0), undefined]],
      } as any;
      const target = DnaFactory.singleBox(100, 100, 0, 0);

      renderer.beforeFrame(world);
      renderer.afterFrame(world, 16, target);

      expect(baseContext.drawImage).toHaveBeenCalledWith(sharedTileCanvas, 0, 0, 100, 100, 0, 0, 100, 100);
    } finally {
      (globalThis as any).Image = OriginalImage;
      createElementSpy.mockRestore();
    }
  });

  test('stays dirty while waiting for shared canvas renderer resources', () => {
    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);
    const schedulePaintToCanvas = vi.fn(() => true);

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    try {
      const renderer = new NavigatorRenderer(canvas, {
        drawFallbackBoxes: false,
        sharedCanvasRenderer: {
          hostCache: {
            get: vi.fn(() => undefined),
          },
          invalidated: [],
          schedulePaintToCanvas,
        } as any,
      });
      const image = new SingleImage();
      image.applyProps({
        id: 'navigator-shared-pending',
        uri: 'https://example.org/navigator-shared-pending.jpg',
        target: { width: 100, height: 100 },
        display: { width: 100, height: 100 },
      } as any);

      const world = {
        width: 100,
        height: 100,
        zones: [],
        getActiveZone: () => undefined,
        getPointsAt: () => [[image, DnaFactory.singleBox(100, 100, 0, 0), undefined]],
      } as any;
      const target = DnaFactory.singleBox(100, 100, 0, 0);

      renderer.beforeFrame(world);
      renderer.afterFrame(world, 16, target);

      expect(schedulePaintToCanvas).toHaveBeenCalledTimes(1);
      expect(renderer.pendingUpdate()).toBe(true);
      expect((renderer as any).worldLayerDirty).toBe(true);
    } finally {
      createElementSpy.mockRestore();
    }
  });

  test('keeps navigator pending when invalidated during world-layer render', () => {
    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);
    const requestRender = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    try {
      const renderer = new NavigatorRenderer(canvas, {
        drawFallbackBoxes: false,
        onRequestRender: requestRender,
      });
      const world = {
        width: 100,
        height: 100,
        zones: [],
        getActiveZone: () => undefined,
        getPointsAt: () => [],
      } as any;
      const target = DnaFactory.singleBox(100, 100, 0, 0);

      const renderWorldLayerSpy = vi.spyOn(renderer as any, 'renderWorldLayer').mockImplementation(() => {
        (renderer as any).invalidateWorldLayer();
      });

      renderer.invalidateWorldLayer();
      requestRender.mockClear();
      renderer.afterFrame(world, 16, target);

      expect(renderWorldLayerSpy).toHaveBeenCalledTimes(1);
      expect(requestRender).toHaveBeenCalledTimes(1);
      expect(renderer.pendingUpdate()).toBe(true);
      expect((renderer as any).worldLayerDirty).toBe(true);
    } finally {
      createElementSpy.mockRestore();
    }
  });

  test('renders a preview image on the frame after it loads asynchronously', () => {
    class AsyncImage {
      static instances: AsyncImage[] = [];

      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: any = null;
      onerror: any = null;
      private _src = '';

      constructor() {
        AsyncImage.instances.push(this);
      }

      set src(value: string) {
        this._src = value;
      }

      get src() {
        return this._src;
      }

      resolve() {
        this.complete = true;
        this.naturalWidth = 640;
        this.naturalHeight = 480;
        if (this.onload) {
          this.onload();
        }
      }
    }

    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);
    const requestRender = vi.fn();

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const OriginalImage = globalThis.Image;
    (globalThis as any).Image = AsyncImage as any;

    try {
      const renderer = new NavigatorRenderer(canvas, {
        drawFallbackBoxes: false,
        onRequestRender: requestRender,
      });
      const image = new SingleImage();
      image.applyProps({
        id: 'navigator-async-preview',
        uri: 'https://example.org/navigator-async-preview.jpg',
        target: { width: 100, height: 100 },
        display: { width: 100, height: 100 },
      } as any);

      const world = {
        width: 100,
        height: 100,
        zones: [],
        getActiveZone: () => undefined,
        getPointsAt: () => [[image, DnaFactory.singleBox(100, 100, 0, 0), undefined]],
      } as any;
      const target = DnaFactory.singleBox(100, 100, 0, 0);

      renderer.beforeFrame(world);
      renderer.afterFrame(world, 16, target);
      expect(baseContext.drawImage).not.toHaveBeenCalledWith(
        expect.any(AsyncImage),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number)
      );
      requestRender.mockClear();

      AsyncImage.instances[0].resolve();
      expect(requestRender).toHaveBeenCalledTimes(1);

      renderer.afterFrame(world, 32, target);

      expect(baseContext.drawImage).toHaveBeenCalledWith(AsyncImage.instances[0], 0, 0, 100, 100);
    } finally {
      (globalThis as any).Image = OriginalImage;
      createElementSpy.mockRestore();
    }
  });

  test('emits navigator debug events for async preview image lifecycle in order', () => {
    class AsyncImage {
      static instances: AsyncImage[] = [];

      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: any = null;
      onerror: any = null;
      private _src = '';

      constructor() {
        AsyncImage.instances.push(this);
      }

      set src(value: string) {
        this._src = value;
      }

      get src() {
        return this._src;
      }

      resolve() {
        this.complete = true;
        this.naturalWidth = 640;
        this.naturalHeight = 480;
        if (this.onload) {
          this.onload();
        }
      }
    }

    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);
    const debugEvents: string[] = [];

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const OriginalImage = globalThis.Image;
    (globalThis as any).Image = AsyncImage as any;

    try {
      const renderer = new NavigatorRenderer(canvas, {
        drawFallbackBoxes: false,
        onRequestRender: vi.fn(),
        onDebugEvent: (event) => {
          debugEvents.push(event.type);
        },
      });
      const image = new SingleImage();
      image.applyProps({
        id: 'navigator-debug-preview',
        uri: 'https://example.org/navigator-debug-preview.jpg',
        target: { width: 100, height: 100 },
        display: { width: 100, height: 100 },
      } as any);

      const world = {
        width: 100,
        height: 100,
        zones: [],
        getActiveZone: () => undefined,
        getPointsAt: () => [[image, DnaFactory.singleBox(100, 100, 0, 0), undefined]],
      } as any;
      const target = DnaFactory.singleBox(100, 100, 0, 0);

      renderer.beforeFrame(world);
      renderer.afterFrame(world, 16, target);
      AsyncImage.instances[0].resolve();
      renderer.afterFrame(world, 32, target);

      const requestIndex = debugEvents.indexOf('preview-image-requested');
      const loadIndex = debugEvents.indexOf('preview-image-loaded');
      const invalidationIndex = debugEvents.lastIndexOf('world-layer-invalidated');
      const renderRequestIndex = debugEvents.lastIndexOf('render-request-forwarded');

      expect(requestIndex).toBeGreaterThanOrEqual(0);
      expect(loadIndex).toBeGreaterThan(requestIndex);
      expect(invalidationIndex).toBeGreaterThan(loadIndex);
      expect(renderRequestIndex).toBeGreaterThan(invalidationIndex);
    } finally {
      (globalThis as any).Image = OriginalImage;
      createElementSpy.mockRestore();
    }
  });
});
