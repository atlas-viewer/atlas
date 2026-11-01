import { afterEach, expect, test, vi } from 'vitest';
import { AtlasImageServiceLoader } from '../../modules/iiif/image-service-loader';

const service = (id: string) =>
  new Response(
    JSON.stringify({
      '@context': 'http://iiif.io/api/image/2/context.json',
      '@id': id,
      width: 1024,
      height: 1024,
      profile: ['http://iiif.io/api/image/2/level2.json'],
      tiles: [{ width: 256, scaleFactors: [1, 2, 4] }],
    })
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('a stalled server does not block another service and times out cleanly', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) =>
      url.includes('stalled')
        ? new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)))
        : Promise.resolve(service(url))
    )
  );
  const loader = new AtlasImageServiceLoader(100);
  const stalled = loader.loadService({ id: 'https://stalled.test/image', width: 1024, height: 1024 });
  const rejection = expect(stalled).rejects.toThrow('timed out');
  const good = await loader.loadService({ id: 'https://working.test/image', width: 1024, height: 1024 });
  expect(good.width).toBe(1024);
  await vi.advanceTimersByTimeAsync(100);
  await rejection;
  expect(loader.fetchingCount).toBe(0);
});

test('deduplicates simultaneous metadata loads and permits retry after HTTP errors', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('missing', { status: 404 }))
    .mockImplementation(async (url: string) => service(url));
  vi.stubGlobal('fetch', fetch);
  const loader = new AtlasImageServiceLoader();
  const resource = { id: 'https://example.org/image', width: 1024, height: 1024 };
  const first = loader.loadService(resource);
  expect(loader.loadService(resource)).toBe(first);
  await expect(first).rejects.toThrow('HTTP 404');
  expect(loader.fetchingCount).toBe(0);
  expect((await loader.loadService(resource)).width).toBe(1024);
  expect(fetch).toHaveBeenCalledTimes(2);
});
