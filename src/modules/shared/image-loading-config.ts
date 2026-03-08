export type ImageLoadingConfig = {
  maxConcurrentRequests: number;
  maxPrefetchPerFrame: number;
  timeoutMs: number;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  errorRetryIntervalMs: number;
  revealDelayFrames: number;
  revealBatchWindowFrames: number;
  skipFadeIfLoadedWithinMs: number;
};

export type ImageLoadingConfigOverrides = Partial<ImageLoadingConfig>;

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g' | string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getNavigatorConnection(): ConnectionInfo | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  const nav = navigator as Navigator & {
    connection?: ConnectionInfo;
    mozConnection?: ConnectionInfo;
    webkitConnection?: ConnectionInfo;
  };

  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

function getAdaptiveConcurrency(connection?: ConnectionInfo): number {
  let concurrency = 10;

  if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
    concurrency = clamp(Math.round(navigator.hardwareConcurrency * 0.75), 4, 10);
  }

  if (connection?.saveData) {
    return 3;
  }

  if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
    return 2;
  }

  if (connection?.effectiveType === '3g') {
    return Math.min(concurrency, 4);
  }

  return concurrency;
}

function getAdaptivePrefetch(maxConcurrentRequests: number, connection?: ConnectionInfo): number {
  if (connection?.saveData) {
    return 0;
  }

  if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
    return 0;
  }

  if (connection?.effectiveType === '3g') {
    return 2;
  }

  return Math.min(maxConcurrentRequests + 2, 12);
}

export function resolveImageLoadingConfig(overrides: ImageLoadingConfigOverrides = {}): ImageLoadingConfig {
  const connection = getNavigatorConnection();
  const adaptiveConcurrency = getAdaptiveConcurrency(connection);

  const maxConcurrentRequests =
    typeof overrides.maxConcurrentRequests === 'number'
      ? Math.max(1, Math.floor(overrides.maxConcurrentRequests))
      : adaptiveConcurrency;

  const maxPrefetchPerFrame =
    typeof overrides.maxPrefetchPerFrame === 'number'
      ? Math.max(0, Math.floor(overrides.maxPrefetchPerFrame))
      : getAdaptivePrefetch(maxConcurrentRequests, connection);

  return {
    maxConcurrentRequests,
    maxPrefetchPerFrame,
    timeoutMs: typeof overrides.timeoutMs === 'number' ? Math.max(250, Math.floor(overrides.timeoutMs)) : 8000,
    maxAttempts: typeof overrides.maxAttempts === 'number' ? Math.max(1, Math.floor(overrides.maxAttempts)) : 3,
    baseDelayMs: typeof overrides.baseDelayMs === 'number' ? Math.max(0, Math.floor(overrides.baseDelayMs)) : 250,
    maxDelayMs: typeof overrides.maxDelayMs === 'number' ? Math.max(0, Math.floor(overrides.maxDelayMs)) : 3000,
    jitterRatio: typeof overrides.jitterRatio === 'number' ? clamp(overrides.jitterRatio, 0, 1) : 0.2,
    errorRetryIntervalMs:
      typeof overrides.errorRetryIntervalMs === 'number' ? Math.max(0, Math.floor(overrides.errorRetryIntervalMs)) : 30000,
    revealDelayFrames:
      typeof overrides.revealDelayFrames === 'number' ? Math.max(0, Math.floor(overrides.revealDelayFrames)) : 1,
    revealBatchWindowFrames:
      typeof overrides.revealBatchWindowFrames === 'number'
        ? Math.max(0, Math.floor(overrides.revealBatchWindowFrames))
        : 1,
    skipFadeIfLoadedWithinMs:
      typeof overrides.skipFadeIfLoadedWithinMs === 'number'
        ? Math.max(0, Math.floor(overrides.skipFadeIfLoadedWithinMs))
        : 120,
  };
}

export function getRetryDelayMs(config: ImageLoadingConfig, attempt: number, random = Math.random): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const exponential = config.baseDelayMs * Math.pow(2, normalizedAttempt - 1);
  const capped = Math.min(config.maxDelayMs, exponential);
  const jitterRange = capped * config.jitterRatio;
  if (!jitterRange) {
    return capped;
  }

  return Math.max(0, Math.floor(capped + (random() * 2 - 1) * jitterRange));
}
