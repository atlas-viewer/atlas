import { popmotionController } from '../../popmotion-controller/popmotion-controller';
import { CompositeRenderer } from '../../composite-renderer/composite-renderer';
import { WebGLRenderer } from '../../webgl-renderer/webgl-renderer';
import { CanvasRenderer } from '../../canvas-renderer/canvas-renderer';
import { OverlayRenderer } from '../../overlay-renderer/overlay-renderer';
import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { Preset, PresetArgs } from './_types';
import { unmountComponentAtNode } from '../reconciler';
import { DebugRenderer } from '../../debug-renderer/debug-renderer';
import { isWebGLImageFastPathCandidate } from '../../webgl-renderer/webgl-eligibility';

export type DefaultPresetName = 'default-preset';

export type DefaultPresetOptions = {
  controllerConfig?: any;
  unstable_webglRenderer?: boolean;
  interactive?: boolean;
  dpi?: number;
  debug?: boolean;
  canvasBox?: boolean;
  polygon?: boolean;
};

export function defaultPreset({
  interactive = true,
  viewport,
  forceRefresh,
  canvasElement,
  parityCanvasElement,
  overlayElement,
  controllerConfig,
  unstable_webglRenderer,
  dpi,
  debug,
  canvasBox = true,
  polygon = true,
  navigatorElement,
  runtimeOptions,
  onWebGLFallback,
}: PresetArgs & DefaultPresetOptions): Preset {
  if (!canvasElement) {
    throw new Error('Invalid container');
  }

  canvasElement.style.userSelect = 'none';

  const controller = interactive
    ? popmotionController({
        minZoomFactor: 0.5,
        maxZoomFactor: 3,
        enableClickToZoom: false,
        parentElement: canvasElement,
        ...(controllerConfig || {}),
      })
    : undefined;

  let baseRenderer: CanvasRenderer | WebGLRenderer;
  let parityCanvasRenderer: CanvasRenderer | undefined;

  if (unstable_webglRenderer) {
    try {
      baseRenderer = new WebGLRenderer(canvasElement, {
        dpi,
        onFatalImageError: onWebGLFallback,
      });
    } catch (error) {
      baseRenderer = new CanvasRenderer(canvasElement, { dpi, debug, box: canvasBox, polygon });
    }
  } else {
    baseRenderer = new CanvasRenderer(canvasElement, { dpi, debug, box: canvasBox, polygon });
  }

  const usingWebGL = baseRenderer instanceof WebGLRenderer;

  if (usingWebGL && parityCanvasElement) {
    parityCanvasRenderer = new CanvasRenderer(parityCanvasElement, {
      dpi,
      debug,
      box: canvasBox,
      polygon,
      paintImages: true,
      shouldPaintImage: (paint, index) => !isWebGLImageFastPathCandidate(paint, index),
      readiness: 'immediate',
    });
  }

  const shouldRenderBoxesInOverlay = usingWebGL && !parityCanvasRenderer ? true : !canvasBox;

  const renderer = new CompositeRenderer([
    baseRenderer,
    parityCanvasRenderer,
    overlayElement
      ? new OverlayRenderer(overlayElement, {
          box: shouldRenderBoxesInOverlay,
          text: true,
          triggerResize: forceRefresh,
        })
      : undefined,
    navigatorElement ? new DebugRenderer(navigatorElement) : undefined,
  ]);

  const runtime = new Runtime(
    renderer,
    new World(1024, 1024),
    viewport,
    controller ? [controller] : [],
    runtimeOptions
  );

  const em = new BrowserEventManager(canvasElement, runtime);

  return {
    name: 'default-preset',
    em,
    runtime,
    renderer,
    controller,
    canvas: canvasElement,
    parityCanvas: parityCanvasRenderer ? parityCanvasElement : undefined,
    navigator: navigatorElement,
    unmount() {
      unmountComponentAtNode(runtime);
      runtime.stopControllers();
      runtime.stop();
      runtime.reset();
      if (em) {
        em.stop();
      }
    },
  };
}
