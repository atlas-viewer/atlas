import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { Runtime, RuntimeOptions } from '../../../renderer/runtime';
import { Renderer } from '../../../renderer/renderer';
import { RuntimeController, Viewer } from '../../../types';
import { AtlasWebGLFallbackEvent } from '../../webgl-renderer/types';
import { AtlasImageLoadErrorEvent } from '../../shared/image-load-events';
import { ImageLoadingConfig } from '../../shared/image-loading-config';

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
  parityCanvas?: HTMLCanvasElement;
  overlay?: HTMLDivElement;
  container?: HTMLDivElement;
  navigator?: HTMLCanvasElement;
};

export type PresetArgs = {
  viewport: Viewer;
  forceRefresh: () => void;
  runtimeOptions?: RuntimeOptions;
  containerElement?: HTMLDivElement;
  canvasElement?: HTMLCanvasElement;
  parityCanvasElement?: HTMLCanvasElement;
  overlayElement?: HTMLDivElement;
  navigatorElement?: HTMLCanvasElement;
  onWebGLFallback?: (event: AtlasWebGLFallbackEvent) => void;
  onImageError?: (event: AtlasImageLoadErrorEvent) => void;
  imageLoading?: Partial<ImageLoadingConfig>;
  webglFallbackOnImageLoadError?: boolean;
};
