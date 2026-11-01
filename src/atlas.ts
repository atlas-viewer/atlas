import { loadImageResource, loadIIIFImageResource } from './modules/iiif/image-resource';
import { BrowserEventManager } from './modules/browser-event-manager/browser-event-manager';
import { CanvasRenderer, type CanvasRendererOptions } from './modules/canvas-renderer/canvas-renderer';
import {
  popmotionController,
  type PopmotionControllerConfig,
} from './modules/popmotion-controller/popmotion-controller';
import { Runtime, type RuntimeOptions } from './renderer/runtime';
import type { Projection } from './types';
import { World } from './world';
import { WorldObject } from './world-objects/world-object';
import type { CompositeResourceProps } from './spacial-content/composite-resource';
import type { SpacialContent } from './spacial-content/spacial-content';

export type AtlasImageOptions = Omit<AtlasOptions, 'world'> & {
  /** Cancel loading before the viewer is created. Use destroy() after creation. */
  signal?: AbortSignal;
};

export type AtlasIIIFOptions = AtlasImageOptions & {
  /** Image format supported by the service. Defaults to jpg. */
  format?: string;
  renderOptions?: CompositeResourceProps;
};

export type AtlasOptions = {
  /** An existing scene, or an empty world when omitted. */
  world?: World;
  /** Initial camera in world coordinates. Supplying it disables automatic home fitting. */
  viewport?: Projection;
  /** Install pan, zoom, touch and scene events. Defaults to true. */
  interactive?: boolean;
  /** Observe the element's CSS size. Defaults to true. */
  autoResize?: boolean;
  /** Initial size in CSS pixels; otherwise measured from the element. */
  width?: number;
  height?: number;
  /** Canvas background, including 'transparent'. Defaults to black. */
  background?: string;
  /** Accessible name for the canvas. */
  label?: string;
  /** Padding in CSS pixels when fitting the scene. */
  homePaddingPx?: Runtime['homePaddingPx'];
  /** Canvas options. DPI defaults to window.devicePixelRatio. */
  rendererOptions?: CanvasRendererOptions;
  controllerConfig?: PopmotionControllerConfig;
  runtimeOptions?: Partial<RuntimeOptions>;
};

export type AtlasViewer = {
  canvas: HTMLCanvasElement;
  world: World;
  runtime: Runtime;
  renderer: CanvasRenderer;
  /** Absent when interactive is false. */
  em?: BrowserEventManager;
  /** Remeasure, or set the drawing size in CSS pixels. Does not change the host's CSS. */
  resize(width?: number, height?: number): void;
  /** Stop rendering, requests and listeners. Removes only a canvas created by atlas(). */
  destroy(): void;
};

/** Create a Canvas 2D viewer without React or a reconciler. Call destroy() on unmount. */
export function atlas(element: HTMLElement, options: AtlasOptions = {}): AtlasViewer {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    throw new TypeError('atlas() requires a container or canvas element');
  }
  const dpi = options.rendererOptions?.dpi ?? window.devicePixelRatio ?? 1;
  const positive = (value: number, name: string) => {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
    return value;
  };
  positive(dpi, 'dpi');
  if (options.width !== undefined) positive(options.width, 'width');
  if (options.height !== undefined) positive(options.height, 'height');
  if (options.viewport) {
    positive(options.viewport.width, 'viewport.width');
    positive(options.viewport.height, 'viewport.height');
    if (!Number.isFinite(options.viewport.x) || !Number.isFinite(options.viewport.y)) {
      throw new RangeError('viewport coordinates must be finite');
    }
  }

  const ownsCanvas = element.tagName.toLowerCase() !== 'canvas';
  const canvas = ownsCanvas ? element.ownerDocument.createElement('canvas') : (element as HTMLCanvasElement);
  const original = {
    style: canvas.getAttribute('style'),
    background: canvas.getAttribute('data-background'),
    label: canvas.getAttribute('aria-label'),
    tabIndex: canvas.getAttribute('tabindex'),
    width: canvas.width,
    height: canvas.height,
  };
  const restoreCanvas = () => {
    if (ownsCanvas) {
      canvas.remove();
    } else {
      const attributes: Array<[string, string | null]> = [
        ['style', original.style],
        ['data-background', original.background],
        ['aria-label', original.label],
        ['tabindex', original.tabIndex],
      ];
      for (const [name, value] of attributes) {
        if (value === null) canvas.removeAttribute(name);
        else canvas.setAttribute(name, value);
      }
      canvas.width = original.width;
      canvas.height = original.height;
    }
  };
  const bounds = element.getBoundingClientRect();
  let hasSize = (options.width ?? bounds.width) > 0 && (options.height ?? bounds.height) > 0;
  let width = options.width ?? (bounds.width || 1);
  let height = options.height ?? (bounds.height || 1);
  let runtime: Runtime | undefined;
  let em: BrowserEventManager | undefined;
  let observer: ResizeObserver | undefined;
  let renderer: CanvasRenderer | undefined;
  let destroyed = false;
  const interactive = options.interactive !== false;
  const world = options.world ?? new World();

  try {
    if (ownsCanvas) {
      Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
      element.appendChild(canvas);
    }
    if (options.background !== undefined || !canvas.hasAttribute('data-background')) {
      canvas.dataset.background = options.background ?? '#000';
    }
    if (options.label !== undefined) canvas.setAttribute('aria-label', options.label);
    if (interactive) {
      canvas.tabIndex = canvas.hasAttribute('tabindex') ? canvas.tabIndex : 0;
      canvas.style.touchAction = 'none';
      canvas.style.userSelect = 'none';
    }
    // Validate controller configuration before starting the runtime's animation loop.
    const controller = interactive
      ? popmotionController({
          minZoomFactor: 0.5,
          maxZoomFactor: 3,
          ...options.controllerConfig,
          parentElement: canvas,
        })
      : undefined;
    renderer = new CanvasRenderer(canvas, { ...options.rendererOptions, dpi });
    const sizeCanvas = () => {
      canvas.width = Math.max(1, Math.round(width * dpi));
      canvas.height = Math.max(1, Math.round(height * dpi));
      renderer!.ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
      renderer!.ctx.imageSmoothingEnabled = true;
      renderer!.resize();
    };
    sizeCanvas();
    const updateWorldSize = () => {
      if (!world.needsRecalculate) return;
      if (world.renderOrder.length) world.recalculateWorldSize();
      else {
        world.resize(0, 0);
        world.needsRecalculate = false;
      }
    };
    updateWorldSize();
    // Do not let a queued bounds change replace an explicit camera during Runtime's first frame.
    world.flushSubscriptions();
    runtime = new Runtime(
      renderer,
      world,
      { x: 0, y: 0, width, height, ...options.viewport, scale: 1 },
      [],
      options.runtimeOptions
    );
    runtime.manualHomePosition = !!options.viewport;
    runtime.setHomePaddingPx(options.homePaddingPx);
    runtime.registerHook('useFrame', () => {
      updateWorldSize();
      world.flushSubscriptions();
    });
    if (options.viewport) runtime.setViewport(options.viewport);
    else runtime.goHome();
    // Runtime starts controllers in its constructor; attach ours after camera setup.
    if (controller) {
      runtime.stopControllers();
      runtime.controllers.push(controller);
      runtime.startControllers();
      em = new BrowserEventManager(canvas, runtime);
    }

    const resize = (nextWidth?: number, nextHeight?: number) => {
      if (destroyed) return;
      if (nextWidth !== undefined) positive(nextWidth, 'width');
      if (nextHeight !== undefined) positive(nextHeight, 'height');
      const rect = element.getBoundingClientRect();
      const w = nextWidth ?? rect.width;
      const h = nextHeight ?? rect.height;
      // Hidden containers will be measured again when they become visible.
      if (w > 0 && h > 0 && (w !== width || h !== height)) {
        const oldWidth = width;
        const oldHeight = height;
        width = w;
        height = h;
        sizeCanvas();
        if (!options.viewport) {
          runtime!.resize(oldWidth, width, oldHeight, height);
          if (!hasSize) runtime!.goHome();
        }
        hasSize = true;
        runtime!.updateNextFrame();
      }
      em?.updateBounds();
      runtime!.updateRendererScreenPosition();
    };
    if (options.autoResize !== false && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => resize());
      observer.observe(element);
    }
    // Position can change without size changing, for example inside a scrolling page.
    const updateBounds = () => {
      em?.updateBounds();
      runtime!.updateRendererScreenPosition();
    };
    window.addEventListener('scroll', updateBounds, true);
    window.addEventListener('resize', resizeFromWindow);
    function resizeFromWindow() {
      if (options.autoResize !== false) resize();
      else updateBounds();
    }

    return {
      canvas,
      world,
      runtime,
      renderer,
      em,
      resize,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        observer?.disconnect();
        window.removeEventListener('scroll', updateBounds, true);
        window.removeEventListener('resize', resizeFromWindow);
        em?.stop();
        runtime!.dispose();
        restoreCanvas();
      },
    };
  } catch (error) {
    observer?.disconnect();
    em?.stop();
    if (runtime) runtime.dispose();
    else renderer?.reset();
    restoreCanvas();
    throw error;
  }
}

function mountImage(
  element: HTMLElement,
  content: SpacialContent,
  size: { width: number; height: number },
  options: AtlasImageOptions
): AtlasViewer {
  options.signal?.throwIfAborted();
  const world = new World();
  const object = WorldObject.createWithProps({ id: content.id, ...size });
  object.appendChild(content);
  world.appendChild(object);
  return atlas(element, { ...options, world });
}

/** Open a plain image, discovering its dimensions. Rejects on load failure or cancellation. */
atlas.image = async function (
  element: HTMLElement,
  url: string,
  options: AtlasImageOptions = {}
): Promise<AtlasViewer> {
  const resource = await loadImageResource(url, {
    signal: options.signal,
    crossOrigin: options.rendererOptions?.crossOrigin,
  });
  return mountImage(element, resource.content, resource, options);
};

/** Open an IIIF Image API 2/3 service URL or info.json without constructing a scene by hand. */
atlas.iiif = async function (element: HTMLElement, url: string, options: AtlasIIIFOptions = {}): Promise<AtlasViewer> {
  const resource = await loadIIIFImageResource(url, {
    ...options,
    crossOrigin: options.rendererOptions?.crossOrigin,
    baseUrl: element.ownerDocument.baseURI,
  });
  return mountImage(element, resource.content, resource, options);
};
