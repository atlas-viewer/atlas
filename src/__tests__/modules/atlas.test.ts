/** @vitest-environment happy-dom */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { atlas, type AtlasViewer, CanvasRenderer, World, WorldObject } from '../../standalone';

const viewers: AtlasViewer[] = [];
let context: CanvasRenderingContext2D;
let getContext: ReturnType<typeof vi.fn>;
let observed: ResizeObserverCallback;
const disconnect = vi.fn();

beforeEach(() => {
  context = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  getContext = vi.fn(() => context);
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const element = createElement(tag);
    if (tag === 'canvas') Object.assign(element, { getContext, width: 300, height: 150 });
    return element;
  });
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);
  vi.spyOn(window, 'cancelAnimationFrame');
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
});

afterEach(() => {
  viewers.splice(0).forEach((viewer) => viewer.destroy());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  disconnect.mockClear();
  document.body.innerHTML = '';
});

function host(width = 400, height = 300, tag = 'div') {
  const element = document.createElement(tag);
  document.body.appendChild(element);
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {},
  }));
  return element;
}

function create(...args: Parameters<typeof atlas>) {
  const viewer = atlas(...args);
  viewers.push(viewer);
  return viewer;
}

test('creates an interactive viewer, fits added content, and releases its resources', () => {
  const element = host();
  const sibling = element.appendChild(document.createElement('button'));
  const world = new World();
  const subscriber = vi.fn();
  const unsubscribe = world.addLayoutSubscriber(subscriber);
  const viewer = create(element, { world, label: 'Painting', rendererOptions: { dpi: 2 } });
  expect(viewer.canvas.width).toBe(800);
  expect(viewer.canvas.height).toBe(600);
  expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  expect(viewer.canvas.getAttribute('aria-label')).toBe('Painting');
  expect(viewer.canvas.tabIndex).toBe(0);
  expect(viewer.runtime.controllersRunning).toBe(true);
  expect(viewer.runtime.controllers).toHaveLength(1);
  expect(viewer.em?.listening).toBe(true);

  const object = WorldObject.createWithProps({ id: 'page', width: 1000, height: 500 });
  world.appendChild(object);
  viewer.runtime.render(performance.now() + 16);
  expect(world.width).toBe(1000);
  expect(world.height).toBe(500);
  expect(viewer.runtime.getViewport()).toEqual({ x: 0, y: -125, width: 1000, height: 750 });
  world.removeChild(object);
  viewer.runtime.render(performance.now() + 32);
  expect(world.width).toBe(0);
  expect(Number.isFinite(viewer.runtime.width)).toBe(true);

  const reset = vi.spyOn(viewer.renderer, 'reset');
  const removeListener = vi.spyOn(viewer.canvas, 'removeEventListener');
  viewer.destroy();
  viewer.destroy();
  expect(reset).toHaveBeenCalledTimes(1);
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(window.cancelAnimationFrame).toHaveBeenCalledWith(123);
  expect(viewer.runtime.controllersRunning).toBe(false);
  expect(viewer.em?.listening).toBe(false);
  expect(removeListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
  expect(world.subscriptions).toEqual([subscriber]);
  expect(element.children).toHaveLength(1);
  expect(element.firstChild).toBe(sibling);
  unsubscribe();
});

test('uses an existing canvas without input handlers and preserves a host-controlled camera on resize', () => {
  const canvas = host(400, 300, 'canvas') as HTMLCanvasElement;
  canvas.style.width = '100%';
  canvas.setAttribute('aria-label', 'Original');
  const originalStyle = canvas.getAttribute('style');
  const camera = { x: 20, y: 30, width: 1000, height: 750 };
  const viewer = create(canvas, {
    interactive: false,
    autoResize: false,
    viewport: camera,
    background: 'transparent',
    label: 'Changed',
    rendererOptions: { dpi: 1 },
  });
  expect(viewer.em).toBeUndefined();
  expect(viewer.runtime.controllers).toHaveLength(0);
  const wheel = new WheelEvent('wheel', { cancelable: true });
  canvas.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  viewer.world.appendChild(WorldObject.createWithProps({ id: 'page', width: 5000, height: 4000 }));
  viewer.runtime.render(performance.now() + 16);
  viewer.resize(800, 600);
  expect(viewer.runtime.getViewport()).toEqual(camera);
  expect(canvas.width).toBe(800);
  viewer.destroy();
  expect(canvas.isConnected).toBe(true);
  expect(canvas.getAttribute('style')).toBe(originalStyle);
  expect(canvas.getAttribute('aria-label')).toBe('Original');
  expect(canvas.hasAttribute('data-background')).toBe(false);
  expect(canvas.width).toBe(300);
  expect(canvas.height).toBe(150);
});

test('waits for a hidden container to have a size and ignores callbacks after destroy', () => {
  const element = host(0, 0);
  const world = new World();
  world.appendChild(WorldObject.createWithProps({ id: 'page', width: 1000, height: 500 }));
  const viewer = create(element, { world, interactive: false, rendererOptions: { dpi: 1 } });
  expect(viewer.canvas.width).toBe(1);
  vi.mocked(element.getBoundingClientRect).mockReturnValue({ width: 640, height: 480 } as DOMRect);
  observed([], {} as ResizeObserver);
  expect(viewer.canvas.width).toBe(640);
  expect(viewer.canvas.height).toBe(480);
  expect(viewer.runtime.getViewport()).toEqual({ x: 0, y: -125, width: 1000, height: 750 });
  viewer.destroy();
  observed([], {} as ResizeObserver);
  viewer.resize(20, 20);
  expect(viewer.canvas.width).toBe(640);
});

test('uses the host camera on the first painted frame of an already populated world', () => {
  const world = new World();
  world.appendChild(WorldObject.createWithProps({ id: 'page', width: 5000, height: 4000 }));
  const frames: number[][] = [];
  const beforeFrame = CanvasRenderer.prototype.beforeFrame;
  vi.spyOn(CanvasRenderer.prototype, 'beforeFrame').mockImplementation(function (this: CanvasRenderer, ...args) {
    frames.push(Array.from(args[2]));
    return beforeFrame.apply(this, args);
  });
  create(host(), { world, viewport: { x: 20, y: 30, width: 1000, height: 750 }, interactive: false });
  expect(frames[0].slice(1)).toEqual([20, 30, 1020, 780]);
});

test('keeps the home fit after resizing a populated world', () => {
  const world = new World();
  world.appendChild(WorldObject.createWithProps({ id: 'page', width: 1000, height: 500 }));
  const viewer = create(host(), { world, interactive: false, rendererOptions: { dpi: 1 } });
  viewer.resize(600, 300);
  const viewport = viewer.runtime.getViewport();
  expect(viewport.width / viewport.height).toBeCloseTo(2);
  expect(viewer.canvas.width).toBe(600);
});

test('rejects invalid dimensions and leaves the DOM intact if canvas setup fails', () => {
  const element = host();
  expect(() => atlas(element, { rendererOptions: { dpi: 0 } })).toThrow(RangeError);
  expect(() => atlas(element, { width: NaN })).toThrow(RangeError);
  expect(() => atlas(element, { viewport: { x: 0, y: 0, width: 0, height: 1 } })).toThrow(RangeError);
  getContext.mockReturnValue(null);
  expect(() => atlas(element)).toThrow('Canvas 2D context unavailable');
  expect(element.children).toHaveLength(0);
  expect(window.requestAnimationFrame).not.toHaveBeenCalled();
});

test('releases the animation loop and world subscription if the first render throws', () => {
  const element = host();
  const world = new World();
  expect(() =>
    atlas(element, {
      world,
      rendererOptions: {
        beforeFrame() {
          throw new Error('Render failed');
        },
      },
    })
  ).toThrow('Render failed');
  expect(world.subscriptions).toHaveLength(0);
  expect(window.cancelAnimationFrame).toHaveBeenCalledWith(123);
  expect(element.children).toHaveLength(0);
});

function mockImage() {
  const images: Array<{
    src: string;
    crossOrigin?: string;
    naturalWidth: number;
    naturalHeight: number;
    onload?: (() => void) | null;
    onerror?: (() => void) | null;
    removeAttribute: ReturnType<typeof vi.fn>;
  }> = [];
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 1200;
      naturalHeight = 800;
      removeAttribute = vi.fn();
      constructor() {
        images.push(this);
      }
    }
  );
  return images;
}

function service(version = 2) {
  return {
    '@context': `http://iiif.io/api/image/${version}/context.json`,
    ...(version === 2
      ? { '@id': 'https://images.example/page' }
      : { id: 'https://images.example/page', type: 'ImageService3' }),
    profile: version === 2 ? ['http://iiif.io/api/image/2/level0.json'] : 'level0',
    width: 1200,
    height: 800,
    tiles: [{ width: 256, scaleFactors: [1, 2, 4] }],
  };
}

function mockService(info: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => info });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

test('opens a plain image without dimensions and honours CORS and viewer options', async () => {
  const images = mockImage();
  const element = host();
  const opening = atlas.image(element, '/painting.jpg', {
    interactive: false,
    label: 'Painting',
    rendererOptions: { dpi: 2, crossOrigin: true },
  });
  expect(element.children).toHaveLength(0);
  expect(images[0].crossOrigin).toBe('anonymous');
  images[0].onload!();
  const viewer = await opening;
  viewers.push(viewer);
  expect(viewer.world.width).toBe(1200);
  expect(viewer.world.height).toBe(800);
  expect(viewer.world.getObjects()[0]!.layers[0]).toMatchObject({ uri: '/painting.jpg' });
  expect(viewer.canvas.width).toBe(800);
  expect(viewer.canvas.getAttribute('aria-label')).toBe('Painting');
  expect(viewer.em).toBeUndefined();
});

test('rejects failed and cancelled plain images without creating a canvas', async () => {
  const images = mockImage();
  const element = host();
  const failed = atlas.image(element, '/missing.jpg');
  images[0].onerror!();
  await expect(failed).rejects.toThrow('Could not load image');
  const controller = new AbortController();
  const pending = atlas.image(element, '/painting.jpg', { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(images[1].removeAttribute).toHaveBeenCalledWith('src');
  expect(images[1].onload).toBeNull();
  await expect(atlas.image(element, '/painting.jpg', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(images).toHaveLength(2);
  expect(element.children).toHaveLength(0);
});

test.each([2, 3])('opens an IIIF v%i service and generates version-specific tile URLs', async (version) => {
  const fetch = mockService(service(version));
  const input = version === 2 ? 'https://images.example/page/' : 'https://images.example/page/info.json';
  const viewer = await atlas.iiif(host(), input, { interactive: false, format: 'png', renderOptions: { fadeInMs: 0 } });
  viewers.push(viewer);
  expect(fetch).toHaveBeenCalledWith('https://images.example/page/info.json', { signal: undefined });
  expect(viewer.world.width).toBe(1200);
  const composite = viewer.world.getObjects()[0]!.layers[0] as import('../../standalone').CompositeResource;
  expect(composite.allImages).toHaveLength(3);
  const tile = composite.allImages.find((image) => image.display.scale === 1)! as import('../../standalone').TiledImage;
  expect(tile.getImageUrl(0)).toBe(
    `https://images.example/page/0,0,256,256/256,${version === 3 ? '256' : ''}/0/default.png`
  );
  expect(composite.renderOptions.fadeInMs).toBe(0);
});

test.each([2, 3])('uses advertised fixed sizes for a non-tiled IIIF v%i service', async (version) => {
  mockService({ ...service(version), tiles: undefined, sizes: [{ width: 600, height: 400 }] });
  const viewer = await atlas.iiif(host(), 'https://images.example/page', { interactive: false });
  viewers.push(viewer);
  const composite = viewer.world.getObjects()[0]!.layers[0] as import('../../standalone').CompositeResource;
  expect(composite.allImages[0]).toMatchObject({
    uri: `https://images.example/page/full/600,${version === 3 ? '400' : ''}/0/default.jpg`,
    display: { width: 600, height: 400 },
  });
});

test.each([2, 3])('loads the full image for an IIIF v%i service with no tiles or sizes', async (version) => {
  const images = mockImage();
  mockService({ ...service(version), tiles: undefined });
  const pending = atlas.iiif(host(), 'https://images.example/page', { interactive: false });
  await vi.waitFor(() => expect(images).toHaveLength(1));
  expect(images[0].src).toBe(`https://images.example/page/full/${version === 3 ? 'max' : 'full'}/0/default.jpg`);
  images[0].onload!();
  const viewer = await pending;
  viewers.push(viewer);
  expect(viewer.world.width).toBe(1200);
});

test('rejects HTTP failures, manifests, invalid dimensions, and invalid tiles', async () => {
  const element = host();
  mockService({}, 404);
  await expect(atlas.iiif(element, 'https://images.example/page')).rejects.toThrow('HTTP 404');
  mockService({ id: 'https://example.org/manifest', type: 'Manifest' });
  await expect(atlas.iiif(element, 'https://images.example/page')).rejects.toThrow('not a manifest');
  mockService({ ...service(), width: 0 });
  await expect(atlas.iiif(element, 'https://images.example/page')).rejects.toThrow('positive width');
  mockService({ ...service(), tiles: [{ width: 256, scaleFactors: [0] }] });
  await expect(atlas.iiif(element, 'https://images.example/page')).rejects.toThrow('scale factor');
  expect(element.children).toHaveLength(0);
});

test('does not mount after an IIIF request is cancelled, even if its response arrives', async () => {
  const element = host();
  const controller = new AbortController();
  const fetch = mockService(service());
  const pending = atlas.iiif(element, 'https://images.example/page', { signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledWith('https://images.example/page/info.json', { signal: controller.signal });
  expect(element.children).toHaveLength(0);
});
