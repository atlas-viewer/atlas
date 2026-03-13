import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { CompositeRenderer } from '../../composite-renderer/composite-renderer';
import { OverlayRenderer } from '../../overlay-renderer/overlay-renderer';
import { pdfScrollZoneController } from '../../pdf-scroll-zone-controller/pdf-scroll-zone-controller';
import { popmotionController } from '../../popmotion-controller/popmotion-controller';
import { StaticRenderer } from '../../static-renderer/static-renderer';
import { unmountComponentAtNode } from '../reconciler';
import type { Preset, PresetArgs } from './_types';

export type StaticPresetName = 'static-preset';

export type StaticPresetOptions = {
  controllerConfig?: any;
  interactionMode?: 'popmotion' | 'pdf-scroll-zone';
  interactive?: boolean;
};

export function staticPreset({
  interactive,
  viewport,
  forceRefresh,
  containerElement,
  overlayElement,
  controllerConfig,
  interactionMode = 'popmotion',
  staging = false,
}: PresetArgs & StaticPresetOptions): Preset {
  if (!containerElement) {
    throw new Error('Invalid container');
  }
  containerElement.style.userSelect = 'none';

  const controllerFactory = interactionMode === 'pdf-scroll-zone' ? pdfScrollZoneController : popmotionController;
  const controller = interactive
    ? controllerFactory({
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
  if (staging) {
    runtime.stopControllers();
  }

  const preset: Preset = {
    name: 'static-preset',
    em: undefined,
    setInteractivity: () => {
      // Replaced below after closure initialization.
    },
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

  let em: BrowserEventManager | undefined = staging ? undefined : new BrowserEventManager(containerElement, runtime);
  preset.em = em;

  const setInteractivity = (nextInteractive: boolean) => {
    if (nextInteractive) {
      runtime.startControllers();
      if (!em) {
        em = new BrowserEventManager(containerElement, runtime);
        preset.em = em;
      }
      em.updateBounds();
      return;
    }

    runtime.stopControllers();
    if (em) {
      em.stop();
      em = undefined;
      preset.em = undefined;
    }
  };
  preset.setInteractivity = setInteractivity;

  return preset;
}
