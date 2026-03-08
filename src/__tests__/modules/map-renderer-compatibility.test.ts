/** @vitest-environment happy-dom */

import { StaticRenderer } from '../../modules/static-renderer/static-renderer';
import { isWebGLImageFastPathCandidate } from '../../modules/webgl-renderer/webgl-eligibility';
import { MapTiledImage } from '../../spacial-content/map-tiled-image';
import { TiledImage } from '../../spacial-content/tiled-image';

describe('map renderer compatibility', () => {
  test('MapTiledImage follows tiled image render paths', () => {
    const image = new MapTiledImage({
      bounds: {
        west: -74.3,
        south: 40.45,
        east: -73.6,
        north: 40.95,
      },
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 10,
    });

    expect(image).toBeInstanceOf(TiledImage);
    expect(isWebGLImageFastPathCandidate(image, 0)).toBe(true);
  });

  test('static renderer paints map tile images', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    });

    const renderer = new StaticRenderer(container);
    const image = new MapTiledImage({
      bounds: {
        west: -74.3,
        south: 40.45,
        east: -73.6,
        north: 40.95,
      },
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 10,
    });

    renderer.paint(image, 0, 0, 0, 256, 256);

    const host = image.__host as { images: HTMLImageElement[] };
    expect(host).toBeDefined();
    expect(host.images[0].src).toContain('https://tile.openstreetmap.org/10/');
  });
});
