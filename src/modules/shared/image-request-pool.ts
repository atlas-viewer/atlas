export class ImageRequestCancelledError extends Error {
  silent: boolean;

  constructor(message = 'Image request cancelled', silent = true) {
    super(message);
    this.name = 'ImageRequestCancelledError';
    this.silent = silent;
  }
}

export function isImageRequestCancelledError(error: unknown): error is ImageRequestCancelledError {
  return error instanceof ImageRequestCancelledError;
}

type RequestAbortReason = 'release' | 'timeout';

type AcquireResult = {
  requestKey: string;
  promise: Promise<HTMLImageElement>;
  release: (opts?: { silent?: boolean }) => void;
};

type RequestEntry = {
  url: string;
  requestKey: string;
  consumers: Set<string>;
  promise: Promise<HTMLImageElement>;
  abortController?: AbortController;
  abortDomImage?: () => void;
  settled: boolean;
  cancelled: boolean;
  silentCancellation: boolean;
  abortReason?: RequestAbortReason;
};

export type ImageRequestPoolOptions = {
  timeoutMs: number;
  crossOrigin?: 'anonymous' | 'use-credentials';
  useFetch?: boolean;
  cache?: Map<string, HTMLImageElement>;
};

let requestCounter = 0;

function nextRequestKey(url: string): string {
  requestCounter += 1;
  return `${requestCounter}:${url}`;
}

function createTimeoutError(url: string): Error {
  return new Error(`Image load timeout: ${url}`);
}

function createAbortError(url: string): Error {
  const error = new Error(`Image request aborted: ${url}`);
  error.name = 'AbortError';
  return error;
}

function isAbortLikeError(error: unknown): boolean {
  if (isImageRequestCancelledError(error)) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = 'name' in error ? (error as { name?: unknown }).name : undefined;
  if (name === 'AbortError' || name === 'CanceledError') {
    return true;
  }

  const message = 'message' in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' && /(aborted|abort|cancelled|canceled)/i.test(message);
}

function loadDomImage(url: string, options: { timeoutMs: number; crossOrigin?: 'anonymous' | 'use-credentials' }) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const image = document.createElement('img');
  image.decoding = 'async';
  if (options.crossOrigin) {
    image.crossOrigin = options.crossOrigin;
  }

  let settled = false;
  let rejectPromise: ((reason?: unknown) => void) | undefined;

  const cleanup = (clearSrc = false) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    image.onload = null;
    image.onerror = null;
    if (clearSrc) {
      image.src = '';
    }
  };

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    rejectPromise = reject;

    image.onload = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(image);
    };

    image.onerror = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(createTimeoutError(url));
    }, options.timeoutMs);

    image.src = url;

    if (image.complete && image.naturalWidth > 0) {
      settled = true;
      cleanup();
      resolve(image);
    }
  });

  const abort = () => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup(true);
    if (rejectPromise) {
      rejectPromise(createAbortError(url));
    }
  };

  return { promise, abort };
}

export class ImageRequestPool {
  private readonly timeoutMs: number;
  private readonly crossOrigin?: 'anonymous' | 'use-credentials';
  private readonly useFetch: boolean;
  private readonly cache: Map<string, HTMLImageElement>;
  private readonly inFlight = new Map<string, RequestEntry>();
  private readonly knownConsumers = new Map<string, Set<string>>();

  constructor(options: ImageRequestPoolOptions) {
    this.timeoutMs = options.timeoutMs;
    this.crossOrigin = options.crossOrigin;
    this.useFetch = !!options.useFetch && typeof fetch !== 'undefined' && typeof AbortController !== 'undefined';
    this.cache = options.cache || new Map<string, HTMLImageElement>();
  }

  acquire(url: string, consumerId: string): AcquireResult {
    const cached = this.cache.get(url);
    if (cached && cached.naturalWidth > 0) {
      return {
        requestKey: `cached:${url}`,
        promise: Promise.resolve(cached),
        release: () => {
          // No-op, fulfilled from cache.
        },
      };
    }

    let entry = this.inFlight.get(url);

    if (!entry) {
      const requestKey = nextRequestKey(url);
      entry = {
        url,
        requestKey,
        consumers: new Set<string>(),
        promise: Promise.resolve(document.createElement('img')),
        settled: false,
        cancelled: false,
        silentCancellation: true,
        abortReason: undefined,
      };

      entry.promise = this.createRequest(entry)
        .then((image) => {
          entry!.settled = true;
          entry!.abortReason = undefined;
          this.cache.set(url, image);
          return image;
        })
        .catch((error) => {
          entry!.settled = true;
          throw this.normalizeRequestError(entry!, error);
        })
        .finally(() => {
          if (entry) {
            entry.abortController = undefined;
            entry.abortDomImage = undefined;
            entry.abortReason = undefined;
          }
          if (entry && entry.consumers.size === 0) {
            this.inFlight.delete(url);
          }
        });

      this.inFlight.set(url, entry);
    }

    entry.consumers.add(consumerId);
    const tracked = this.knownConsumers.get(consumerId) || new Set<string>();
    tracked.add(url);
    this.knownConsumers.set(consumerId, tracked);

    return {
      requestKey: entry.requestKey,
      promise: entry.promise,
      release: (opts) => {
        this.release(url, consumerId, opts);
      },
    };
  }

  release(url: string, consumerId: string, opts: { silent?: boolean } = {}) {
    const tracked = this.knownConsumers.get(consumerId);
    if (tracked) {
      tracked.delete(url);
      if (tracked.size === 0) {
        this.knownConsumers.delete(consumerId);
      }
    }

    const entry = this.inFlight.get(url);
    if (!entry) {
      return;
    }

    entry.consumers.delete(consumerId);
    if (opts.silent === false) {
      entry.silentCancellation = false;
    }

    if (entry.consumers.size > 0) {
      return;
    }

    if (!entry.settled) {
      entry.cancelled = true;
      if (!entry.abortReason) {
        entry.abortReason = 'release';
      }
      if (entry.abortController) {
        entry.abortController.abort();
      }
      if (entry.abortDomImage) {
        entry.abortDomImage();
      }
      return;
    }

    this.inFlight.delete(url);
  }

  releaseConsumer(consumerId: string, opts: { silent?: boolean } = {}) {
    const tracked = this.knownConsumers.get(consumerId);
    if (!tracked) {
      return;
    }

    for (const url of [...tracked]) {
      this.release(url, consumerId, opts);
    }
  }

  cancelAll(opts: { silent?: boolean } = {}) {
    const consumers = [...this.knownConsumers.keys()];
    for (const consumerId of consumers) {
      this.releaseConsumer(consumerId, opts);
    }
  }

  private normalizeRequestError(entry: RequestEntry, error: unknown): unknown {
    if (entry.abortReason === 'timeout') {
      return isAbortLikeError(error) ? createTimeoutError(entry.url) : error;
    }

    if (entry.abortReason === 'release' || entry.cancelled || isAbortLikeError(error)) {
      return new ImageRequestCancelledError('Image request cancelled', entry.silentCancellation);
    }

    return error;
  }

  private async createRequest(entry: RequestEntry): Promise<HTMLImageElement> {
    if (this.useFetch) {
      const abortController = new AbortController();
      entry.abortController = abortController;
      const timeout = setTimeout(() => {
        if (entry.abortReason === 'release' || entry.settled) {
          return;
        }
        entry.abortReason = 'timeout';
        abortController.abort(createTimeoutError(entry.url));
      }, this.timeoutMs);
      try {
        const credentials = this.crossOrigin === 'use-credentials' ? 'include' : 'same-origin';
        const response = await fetch(entry.url, {
          signal: abortController.signal,
          credentials,
        });
        if (!response.ok) {
          throw new Error(`Image request failed (${response.status}): ${entry.url}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
          const { promise, abort } = loadDomImage(objectUrl, {
            timeoutMs: this.timeoutMs,
            crossOrigin: undefined,
          });
          entry.abortDomImage = abort;
          return await promise;
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    const { promise, abort } = loadDomImage(entry.url, {
      timeoutMs: this.timeoutMs,
      crossOrigin: this.crossOrigin,
    });
    entry.abortDomImage = abort;
    return promise;
  }
}
