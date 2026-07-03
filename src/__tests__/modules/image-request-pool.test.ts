/** @vitest-environment happy-dom */

import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  ImageRequestPool,
  ImageRequestCancelledError,
  isImageRequestCancelledError,
} from '../../modules/shared/image-request-pool';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installMockImageFactory() {
  const originalCreateElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: any) => {
    if (tagName.toLowerCase() !== 'img') {
      return originalCreateElement(tagName as any, options);
    }

    let src = '';
    return {
      onload: null,
      onerror: null,
      decoding: 'async',
      crossOrigin: undefined,
      complete: false,
      naturalWidth: 0,
      get src() {
        return src;
      },
      set src(value: string) {
        src = value;
      },
    } as any as HTMLImageElement;
  }) as any);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ImageRequestPool', () => {
  test('dedupes URL requests across consumers and reuses cache', async () => {
    const pool = new ImageRequestPool({ timeoutMs: 1000 });
    const d = deferred<HTMLImageElement>();
    const createRequest = vi.spyOn(pool as any, 'createRequest').mockReturnValue(d.promise);

    const a = pool.acquire('https://example.com/a.jpg', 'consumer-a');
    const b = pool.acquire('https://example.com/a.jpg', 'consumer-b');

    expect(createRequest).toHaveBeenCalledTimes(1);

    const image = { naturalWidth: 120 } as HTMLImageElement;
    d.resolve(image);

    await expect(a.promise).resolves.toBe(image);
    await expect(b.promise).resolves.toBe(image);

    const c = pool.acquire('https://example.com/a.jpg', 'consumer-c');
    await expect(c.promise).resolves.toBe(image);
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  test('aborts in-flight request when last consumer releases', () => {
    const pool = new ImageRequestPool({ timeoutMs: 1000 });
    const d = deferred<HTMLImageElement>();
    vi.spyOn(pool as any, 'createRequest').mockReturnValue(d.promise);

    const a = pool.acquire('https://example.com/a.jpg', 'consumer-a');
    const b = pool.acquire('https://example.com/a.jpg', 'consumer-b');

    const entry = (pool as any).inFlight.get('https://example.com/a.jpg');
    const abortController = { abort: vi.fn() };
    const abortDomImage = vi.fn();
    entry.abortController = abortController;
    entry.abortDomImage = abortDomImage;

    a.release({ silent: true });
    expect(abortController.abort).not.toHaveBeenCalled();
    expect(abortDomImage).not.toHaveBeenCalled();

    b.release({ silent: true });
    expect(abortController.abort).toHaveBeenCalledTimes(1);
    expect(abortDomImage).toHaveBeenCalledTimes(1);
  });

  test('classifies silent cancellation errors for stale work', async () => {
    const pool = new ImageRequestPool({ timeoutMs: 1000 });
    const d = deferred<HTMLImageElement>();
    vi.spyOn(pool as any, 'createRequest').mockReturnValue(d.promise);

    const request = pool.acquire('https://example.com/a.jpg', 'consumer-a');
    const entry = (pool as any).inFlight.get('https://example.com/a.jpg');
    entry.cancelled = true;
    entry.silentCancellation = true;

    d.reject(new Error('aborted'));

    await expect(request.promise).rejects.toBeInstanceOf(ImageRequestCancelledError);

    try {
      await request.promise;
    } catch (error) {
      expect(isImageRequestCancelledError(error)).toBe(true);
      if (isImageRequestCancelledError(error)) {
        expect(error.silent).toBe(true);
      }
    }
  });

  test('rejects cancelled dom image requests promptly and removes them from the pool', async () => {
    installMockImageFactory();
    const pool = new ImageRequestPool({ timeoutMs: 1000 });

    const request = pool.acquire('https://example.com/cancelled.jpg', 'consumer-a');
    request.release({ silent: true });

    await expect(request.promise).rejects.toBeInstanceOf(ImageRequestCancelledError);
    await Promise.resolve();

    expect((pool as any).inFlight.size).toBe(0);
  });

  test('reacquires a fresh request after cancellation settles', async () => {
    installMockImageFactory();
    const pool = new ImageRequestPool({ timeoutMs: 1000 });

    const first = pool.acquire('https://example.com/retry.jpg', 'consumer-a');
    first.release({ silent: true });
    await expect(first.promise).rejects.toBeInstanceOf(ImageRequestCancelledError);

    const second = pool.acquire('https://example.com/retry.jpg', 'consumer-b');
    expect(second.requestKey).not.toBe(first.requestKey);
    second.release({ silent: true });
    await expect(second.promise).rejects.toBeInstanceOf(ImageRequestCancelledError);
  });

  test('normalizes abort-like failures even when cancellation state is not preset', async () => {
    const pool = new ImageRequestPool({ timeoutMs: 1000 });
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.spyOn(pool as any, 'createRequest').mockRejectedValue(abortError);

    const request = pool.acquire('https://example.com/abort.jpg', 'consumer-a');

    await expect(request.promise).rejects.toBeInstanceOf(ImageRequestCancelledError);
  });

  test('times out stalled requests and cleans up tracking', async () => {
    vi.useFakeTimers();
    installMockImageFactory();
    const pool = new ImageRequestPool({ timeoutMs: 10 });
    const request = pool.acquire('https://example.com/slow.jpg', 'consumer-a');
    const handled = request.promise.catch((error) => error as Error);

    await vi.advanceTimersByTimeAsync(11);
    const error = await handled;
    expect(error.message).toContain('timeout');
    expect(isImageRequestCancelledError(error)).toBe(false);

    request.release({ silent: true });
    await Promise.resolve();

    expect((pool as any).inFlight.size).toBe(0);
    vi.useRealTimers();
  });

  test('keeps fetch timeouts as load errors instead of cancellations', async () => {
    vi.useFakeTimers();
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const rejectOnAbort = () => {
          reject(signal?.reason ?? new Error('aborted'));
        };

        if (signal?.aborted) {
          rejectOnAbort();
          return;
        }

        signal?.addEventListener('abort', rejectOnAbort, { once: true });
      });
    });

    try {
      const pool = new ImageRequestPool({ timeoutMs: 10, useFetch: true });
      const request = pool.acquire('https://example.com/fetch-timeout.jpg', 'consumer-a');
      const handled = request.promise.catch((error) => error as Error);

      await vi.advanceTimersByTimeAsync(11);
      const error = await handled;

      expect(error.message).toContain('timeout');
      expect(isImageRequestCancelledError(error)).toBe(false);
    } finally {
      if (typeof originalFetch === 'undefined') {
        delete (globalThis as any).fetch;
      } else {
        (globalThis as any).fetch = originalFetch;
      }
      vi.useRealTimers();
    }
  });
});
