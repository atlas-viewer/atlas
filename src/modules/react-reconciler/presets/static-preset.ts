import { popmotionController } from '../../popmotion-controller/popmotion-controller';
import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { Preset, PresetArgs } from './_types';
import { StaticRenderer } from '../../static-renderer/static-renderer';
import { unmountComponentAtNode } from '../reconciler';
import { CompositeRenderer } from '../../composite-renderer/composite-renderer';
import { OverlayRenderer } from '../../overlay-renderer/overlay-renderer';

export type StaticPresetName = 'static-preset';

export type StaticPresetOptions = {
  controllerConfig?: any;
  interactive?: boolean;
};

export function staticPreset({
  interactive,
  viewport,
  forceRefresh,
  containerElement,
  overlayElement,
  controllerConfig,
}: PresetArgs & StaticPresetOptions): Preset {
  if (!containerElement) {
    throw new Error('Invalid container');
  }
  containerElement.style.userSelect = 'none';

  const controller = interactive
    ? popmotionController({
        minZoomFactor: 0.5,
        maxZoomFactor: 3,
        enableClickToZoom: false,
        parentElement: containerElement,
        ...(controllerConfig || {}),
      })
    : undefined;

  const staticRenderer = new StaticRenderer(containerElement, {
    addPart: false,
    setDraggableFalse: false,
    imageClass: 'atlas-static-image',
  });
  const renderer = overlayElement
    ? new CompositeRenderer([
        staticRenderer,
        new OverlayRenderer(overlayElement, {
          box: true,
          text: true,
          triggerResize: forceRefresh,
        }),
      ])
    : staticRenderer;

  const runtime = new Runtime(renderer, new World(1024, 1024), viewport, controller ? [controller] : []);

  const em = new BrowserEventManager(containerElement, runtime);

  return {
    name: 'static-preset',
    em,
    runtime,
    renderer,
    controller,
    container: containerElement,
    overlay: overlayElement,
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
