import { expect, test } from 'vitest';
import { getImageServicePreloadUrls } from '../../modules/iiif/preload';

test('preloads the fitted tile level and a complete fallback using Atlas tile URLs', () => {
  const urls = getImageServicePreloadUrls(
    {
      id: 'https://example.org/image',
      type: 'ImageService3',
      profile: 'level2',
      '@context': 'http://iiif.io/api/image/3/context.json',
      width: 1024,
      height: 1024,
      tiles: [{ width: 512, scaleFactors: [1, 2, 4] }],
    },
    { width: 900, height: 900 }
  );
  expect(urls).toHaveLength(5);
  expect(urls).toContain('https://example.org/image/0,0,512,512/512,512/0/default.jpg');
  expect(urls).toContain('https://example.org/image/0,0,1024,1024/256,256/0/default.jpg');
});

test('does not fan out over an oversized high-resolution image', () => {
  const urls = getImageServicePreloadUrls(
    {
      id: 'https://example.org/image',
      type: 'ImageService2',
      profile: 'level2',
      width: 100000,
      height: 100000,
      tiles: [{ width: 256, scaleFactors: [1, 2, 4, 8, 16, 32, 64, 128] }],
    },
    { width: 100000, height: 100000 }
  );
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.length).toBeLessThanOrEqual(16);
});
