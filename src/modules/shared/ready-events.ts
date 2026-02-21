export type AtlasReadyResetReason = 'initial' | 'manual' | 'ready-reset-key-change' | 'runtime-reset';

export type AtlasReadyRenderer = 'canvas' | 'webgl' | 'static' | 'composite' | 'unknown';

export type AtlasReadyEvent = {
  runtimeId: string;
  cycle: number;
  reason: AtlasReadyResetReason;
  renderer: AtlasReadyRenderer;
  timestamp: number;
};
