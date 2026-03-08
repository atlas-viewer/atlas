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
