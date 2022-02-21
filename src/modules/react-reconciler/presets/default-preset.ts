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
import { DebugRenderer } from "../../debug-renderer/debug-renderer";

export type DefaultPresetName = 'default-preset';

export type DefaultPresetOptions = {
  controllerConfig?: any;
  unstable_webglRenderer?: boolean;
  interactive?: boolean;
  dpi?: number;
  canvasBox?: boolean;
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
  canvasBox = true,
  navigatorElement,
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
        ...(controllerConfig || {}),
      })
    : undefined;

  const renderer = new CompositeRenderer([
    unstable_webglRenderer
      ? new WebGLRenderer(canvasElement)
      : new CanvasRenderer(canvasElement, { dpi, debug: false, box: canvasBox }),
    overlayElement
      ? new OverlayRenderer(overlayElement, {
          box: unstable_webglRenderer || !canvasBox,
          text: true,
          triggerResize: forceRefresh,
        })
      : undefined,
    navigatorElement ? new DebugRenderer(navigatorElement) : undefined,
  ]);

  const runtime = new Runtime(renderer, new World(1024, 1024), viewport, controller ? [controller] : []);

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
      if (em) {
        em.stop();
      }
    },
  };
}
