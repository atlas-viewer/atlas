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

export type DefaultPresetName = 'default-preset';

export type DefaultPresetOptions = {
  controllerConfig?: any;
  unstable_webglRenderer?: boolean;
  interactive?: boolean;
  dpi?: number;
  debug?: boolean;
  canvasBox?: boolean;
  polygon?: boolean;
  background?: string;
};

export function defaultPreset({
  interactive = true,
  viewport,
  forceRefresh,
  canvasElement,
  overlayElement,
  controllerConfig,
  unstable_webglRenderer,
  dpi,
  debug,
  canvasBox = true,
  polygon = true,
  navigatorElement,
  background,
  runtimeOptions,
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

  const renderer = new CompositeRenderer([
    unstable_webglRenderer
      ? new WebGLRenderer(canvasElement, { dpi })
      : new CanvasRenderer(canvasElement, { dpi, debug, box: canvasBox, polygon, background }),
    overlayElement
      ? new OverlayRenderer(overlayElement, {
          box: unstable_webglRenderer || !canvasBox,
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
