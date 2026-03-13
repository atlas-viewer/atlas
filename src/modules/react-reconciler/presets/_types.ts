import type { Renderer } from '../../../renderer/renderer';
import type { Runtime, RuntimeOptions } from '../../../renderer/runtime';
import type { RuntimeController, Viewer } from '../../../types';
import type { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import type { AtlasImageLoadErrorEvent } from '../../shared/image-load-events';
import type { ImageLoadingConfig } from '../../shared/image-loading-config';
import type { AtlasWebGLFallbackEvent } from '../../webgl-renderer/types';

export type Preset = {
  name: string;
  // Atlas.
  runtime: Runtime;
  renderer: Renderer;
  controller?: RuntimeController;
  em?: BrowserEventManager;
  setInteractivity?: (interactive: boolean) => void;

  // Lifecycle.
  ready?: boolean;
  unmount(): void;

  // Elements.
  canvas?: HTMLCanvasElement;
  parityCanvas?: HTMLCanvasElement;
  overlay?: HTMLDivElement;
  container?: HTMLDivElement;
  navigator?: HTMLCanvasElement;
};

export type PresetArgs = {
  viewport: Viewer;
  forceRefresh: () => void;
  controllerConfig?: any;
  interactionMode?: 'popmotion' | 'pdf-scroll-zone';
  runtimeOptions?: Partial<RuntimeOptions>;
  containerElement?: HTMLDivElement;
  canvasElement?: HTMLCanvasElement;
  parityCanvasElement?: HTMLCanvasElement;
  overlayElement?: HTMLDivElement;
  navigatorElement?: HTMLCanvasElement;
  onWebGLFallback?: (event: AtlasWebGLFallbackEvent) => void;
  onImageError?: (event: AtlasImageLoadErrorEvent) => void;
  imageLoading?: Partial<ImageLoadingConfig>;
  webglFallbackOnImageLoadError?: boolean;
  webglReadiness?: 'first-meaningful-paint' | 'immediate';
  staging?: boolean;
};
