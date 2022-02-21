import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { Runtime } from '../../../renderer/runtime';
import { Renderer } from '../../../renderer/renderer';
import { RuntimeController, Viewer } from '../../../types';

export type Preset = {
  name: string;
  // Atlas.
  runtime: Runtime;
  renderer: Renderer;
  controller?: RuntimeController;
  em?: BrowserEventManager;

  // Lifecycle.
  ready?: boolean;
  unmount(): void;

  // Elements.
  canvas?: HTMLCanvasElement;
  overlay?: HTMLDivElement;
  container?: HTMLDivElement;
  navigator?: HTMLCanvasElement;
};

export type PresetArgs = {
  viewport: Viewer;
  forceRefresh: () => void;
  containerElement?: HTMLDivElement;
  canvasElement?: HTMLCanvasElement;
  overlayElement?: HTMLDivElement;
  navigatorElement?: HTMLCanvasElement;
};
