import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { CanvasRenderer } from '../../canvas-renderer/canvas-renderer';
import { CompositeRenderer } from '../../composite-renderer/composite-renderer';
import { NavigatorRenderer, type NavigatorRendererOptions } from '../../navigator-renderer/navigator-renderer';
import { OverlayRenderer } from '../../overlay-renderer/overlay-renderer';
import { pdfScrollZoneController } from '../../pdf-scroll-zone-controller/pdf-scroll-zone-controller';
import { popmotionController } from '../../popmotion-controller/popmotion-controller';
import { isWebGLImageFastPathCandidate } from '../../webgl-renderer/webgl-eligibility';
import { WebGLRenderer } from '../../webgl-renderer/webgl-renderer';
import { unmountComponentAtNode } from '../reconciler';
import type { Preset, PresetArgs } from './_types';

export type DefaultPresetName = 'default-preset';

export type DefaultPresetOptions = {
  controllerConfig?: any;
  interactionMode?: 'popmotion' | 'pdf-scroll-zone';
  unstable_webglRenderer?: boolean;
  interactive?: boolean;
  dpi?: number;
  debug?: boolean;
  canvasBox?: boolean;
  polygon?: boolean;
  navigatorRendererOptions?: NavigatorRendererOptions;
};

export function defaultPreset({
  interactive = true,
  viewport,
  forceRefresh,
  canvasElement,
  parityCanvasElement,
  overlayElement,
  controllerConfig,
  interactionMode = 'popmotion',
  unstable_webglRenderer,
  dpi,
  debug,
  canvasBox = true,
  polygon = true,
  navigatorElement,
  runtimeOptions,
  onWebGLFallback,
  onImageError,
  imageLoading,
  webglFallbackOnImageLoadError,
  webglReadiness,
  navigatorRendererOptions,
}: PresetArgs & DefaultPresetOptions): Preset {
  if (!canvasElement) {
    throw new Error('Invalid container');
  }

  canvasElement.style.userSelect = 'none';

  const controllerFactory = interactionMode === 'pdf-scroll-zone' ? pdfScrollZoneController : popmotionController;
  const controller = interactive
    ? controllerFactory({
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
        onImageError,
        imageLoading,
        fallbackOnImageLoadError: webglFallbackOnImageLoadError,
        readiness: webglReadiness,
      });
    } catch (error) {
      baseRenderer = new CanvasRenderer(canvasElement, {
        dpi,
        debug,
        box: canvasBox,
        polygon,
        imageLoading,
        onImageError,
      });
    }
  } else {
    baseRenderer = new CanvasRenderer(canvasElement, {
      dpi,
      debug,
      box: canvasBox,
      polygon,
      imageLoading,
      onImageError,
    });
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
      imageLoading,
      onImageError,
    });
  }

  const shouldRenderBoxesInOverlay = usingWebGL && !parityCanvasRenderer ? true : !canvasBox;
  const runtimeRef: { current?: Runtime } = {};
  const externalNavigatorRenderRequest = navigatorRendererOptions?.onRequestRender;
  const navigatorRenderer = navigatorElement
    ? new NavigatorRenderer(navigatorElement, {
        ...(navigatorRendererOptions || {}),
        onRequestRender: () => {
          if (externalNavigatorRenderRequest) {
            externalNavigatorRenderRequest();
          }
          if (runtimeRef.current) {
            runtimeRef.current.updateNextFrame();
          }
        },
      })
    : undefined;

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
    navigatorRenderer,
  ]);

  const runtime = new Runtime(
    renderer,
    new World(1024, 1024),
    viewport,
    controller ? [controller] : [],
    runtimeOptions
  );
  runtimeRef.current = runtime;

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
