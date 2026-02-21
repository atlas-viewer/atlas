/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';
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

  test('times out stalled requests and cleans up tracking', async () => {
    vi.useFakeTimers();
    const pool = new ImageRequestPool({ timeoutMs: 10 });
    const request = pool.acquire('https://example.com/slow.jpg', 'consumer-a');
    const handled = request.promise.catch((error) => error as Error);

    await vi.advanceTimersByTimeAsync(11);
    const error = await handled;
    expect(error.message).toContain('timeout');

    request.release({ silent: true });
    await Promise.resolve();

    expect((pool as any).inFlight.size).toBe(0);
    vi.useRealTimers();
  });
});
