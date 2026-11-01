export type AtlasImageLoadErrorSeverity = 'recoverable' | 'fatal';
export type AtlasImageLoadRenderer = 'canvas' | 'webgl';

export type AtlasImageLoadErrorEvent = {
  severity: AtlasImageLoadErrorSeverity;
  renderer: AtlasImageLoadRenderer;
  imageUrl?: string;
  contentId?: string;
  tileIndex?: number;
  attempt?: number;
  maxAttempts?: number;
  willRetry?: boolean;
  nextRetryAt?: number;
  error?: unknown;
};

/** Emitted once a decoded image has been committed to a renderer's tile cache. */
export type AtlasImageLoadedEvent = {
  renderer: AtlasImageLoadRenderer;
  imageUrl: string;
  contentId: string;
  tileIndex: number;
  image: HTMLImageElement;
  /** Scene object owning the resource, when attached to a world. */
  objectId?: string;
};
