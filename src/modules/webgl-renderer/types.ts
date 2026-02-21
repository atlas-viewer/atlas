export type AtlasWebGLFallbackReason =
  | 'image-cors-or-load'
  | 'teximage-security'
  | 'webgl-context-unavailable'
  | 'webgl-context-lost';

export type AtlasWebGLFallbackEvent = {
  from: 'webgl';
  to: 'canvas';
  reason: AtlasWebGLFallbackReason;
  imageUrl?: string;
  contentId?: string;
  tileIndex?: number;
  error?: unknown;
};
