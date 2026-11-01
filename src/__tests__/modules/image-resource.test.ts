import { afterEach, expect, test, vi } from 'vitest';
import { loadIIIFImageResource } from '../../modules/iiif/image-resource';
import { CompositeResource } from '../../spacial-content/composite-resource';
import type { ImageService } from '@iiif/presentation-3';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test('native resource loading reuses inline metadata without constructing a viewer or fetching again', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const info = {
    id: 'https://images.example/painting',
    type: 'ImageService3',
    profile: 'level1',
    width: 1200,
    height: 800,
    tiles: [{ width: 256, scaleFactors: [1, 2, 4] }],
  } as ImageService;
  const resource = await loadIIIFImageResource(info, { format: 'png', renderOptions: { fadeInMs: 0 } });
  expect(fetch).not.toHaveBeenCalled();
  expect(resource).toMatchObject({ width: 1200, height: 800 });
  expect(resource.content).toBeInstanceOf(CompositeResource);
  expect((resource.content as CompositeResource).allImages).toHaveLength(3);
  expect((resource.content as CompositeResource).allImages[0].getImageUrl?.(0)).toContain('/0/default.png');
  expect(info.tiles?.[0].scaleFactors).toEqual([1, 2, 4]);
});
test('an already cancelled native load rejects even when given inline metadata', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(loadIIIFImageResource({} as ImageService, { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
});
