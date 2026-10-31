/** @vitest-environment happy-dom */

import { dna, DnaFactory } from '@atlas-viewer/dna';
import { vi } from 'vitest';
import { CompositeResource } from '../../spacial-content/composite-resource';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';

function createImage(id: string, displayWidth: number, displayHeight: number) {
  const image = new SingleImage();
  image.applyProps({
    id,
    uri: `https://example.org/${id}.jpg`,
    target: { width: 100, height: 100 },
    display: { width: displayWidth, height: displayHeight },
  });
  return image;
}

describe('CompositeResource', () => {
  test.each(['canvas', 'webgl'])('%s loading layers do not displace loaded fallbacks from the layer budget', (host) => {
    const images = [100, 50, 25, 12.5].map((width, i) => createImage(`level-${i}`, width, width));
    const loaded = [false, true, true, true];
    images.forEach((image, i) => { image.__host = { [host]: { isTileLoaded: () => loaded[i] } }; });
    const composite = new CompositeResource({
      id: 'comp', width: 100, height: 100, images,
      renderOptions: { minSize: 0, renderLayers: 2, renderSmallestFallback: false, useDevicePixelRatio: false },
    });
    composite._sortByScales();
    const selected = () => composite.getAllPointsAt(DnaFactory.singleBox(100, 100), undefined, 1).map(([image]) => image);
    expect(selected()).toEqual([images[2], images[1], images[0]]);
    loaded[1] = false;
    expect(selected()).toEqual([images[3], images[2], images[1], images[0]]);
    loaded[0] = loaded[1] = true;
    expect(selected()).toEqual([images[1], images[0]]);
    composite.applyProps({ layerPolicy: 'active-only' });
    loaded[0] = false;
    expect(selected()).toEqual([images[0]]);
  });

  test('only visible tiles count toward layer readiness, including newly exposed tiles after a pan', () => {
    const high = new TiledImage({
      url: '/tiles', scaleFactor: 1, points: dna([1, 0, 0, 50, 100, 1, 50, 0, 100, 100]),
      tileWidth: 50, tileHeight: 100, width: 100, height: 100, columns: 2, rows: 1,
    });
    high.__host = { canvas: { isTileLoaded: (index: number) => index === 0 } };
    const low = createImage('fallback', 25, 25);
    low.__host = { canvas: { isTileLoaded: () => true } };
    const composite = new CompositeResource({
      id: 'comp', width: 100, height: 100, images: [high, low],
      renderOptions: { minSize: 0, renderLayers: 1, renderSmallestFallback: false, useDevicePixelRatio: false },
    });
    composite._sortByScales();
    expect(composite.getAllPointsAt(DnaFactory.singleBox(40, 100), undefined, 1).map(([image]) => image)).toEqual([high]);
    expect(composite.getAllPointsAt(DnaFactory.singleBox(40, 100, 60, 0), undefined, 1).map(([image]) => image)).toEqual([low, high]);
  });

  test('removeChild removes image from both allImages and render candidates', () => {
    const a = createImage('a', 100, 100);
    const b = createImage('b', 50, 50);
    const composite = new CompositeResource({
      id: 'comp',
      width: 100,
      height: 100,
      images: [a, b],
      renderOptions: {
        minSize: 0,
        maxImageSize: 99999,
      },
    });

    for (const update of composite.getScheduledUpdates(DnaFactory.singleBox(100, 100), 1)) {
      update();
    }

    composite.removeChild(b);

    for (const update of composite.getScheduledUpdates(DnaFactory.singleBox(100, 100), 1)) {
      update();
    }

    expect(composite.images).toEqual([a]);
    expect(composite.allImages).toEqual([a]);

    const paints = composite.getAllPointsAt(DnaFactory.singleBox(100, 100), undefined, 1);
    const rendered = paints.map((paint) => paint[0]);
    expect(rendered).toEqual([a]);
  });

  test('fallback-only marks only best + smallest fallback as active', () => {
    const high = createImage('high', 100, 100);
    const mid = createImage('mid', 50, 50);
    const low = createImage('low', 25, 25);

    const composite = new CompositeResource({
      id: 'comp',
      width: 100,
      height: 100,
      images: [high, mid, low],
      renderOptions: {
        minSize: 0,
        maxImageSize: 99999,
        renderLayers: 3,
        renderSmallestFallback: true,
        layerPolicy: 'fallback-only',
      },
    });

    for (const update of composite.getScheduledUpdates(DnaFactory.singleBox(100, 100), 1)) {
      update();
    }

    composite.getAllPointsAt(DnaFactory.singleBox(100, 100), undefined, 1);

    expect(composite.isImageActive(high)).toBe(true);
    expect(composite.isImageActive(mid)).toBe(false);
    expect(composite.isImageActive(low)).toBe(true);
  });

  test('renders lowest quality first for composite layers', () => {
    const high = createImage('high', 400, 400);
    const mid = createImage('mid', 200, 200);
    const low = createImage('low', 100, 100);

    const composite = new CompositeResource({
      id: 'comp',
      width: 100,
      height: 100,
      images: [high, mid, low],
      renderOptions: {
        minSize: 0,
        maxImageSize: 99999,
        renderLayers: 3,
        renderSmallestFallback: true,
        layerPolicy: 'always-blend',
        quality: 10,
      },
    });

    for (const update of composite.getScheduledUpdates(DnaFactory.singleBox(100, 100), 1)) {
      update();
    }

    const paints = composite.getAllPointsAt(DnaFactory.singleBox(100, 100), undefined, 1);
    const rendered = paints.map((paint) => (paint[0] as SingleImage).id);
    expect(rendered).toEqual(['low', 'mid', 'high']);
  });

  test('loadFullResource resets loading flag after failure and succeeds on retry', async () => {
    const base = createImage('base', 100, 100);
    const extra = createImage('extra', 200, 200);
    let attempts = 0;
    const composite = new CompositeResource({
      id: 'comp',
      width: 100,
      height: 100,
      images: [base],
      loadFullImages: async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('network');
        }
        return [extra];
      },
    });

    await expect(composite.loadFullResource()).rejects.toThrow('network');
    expect(composite.isLoadingFullResource).toBe(false);
    expect(composite.isFullyLoaded).toBe(false);

    await composite.loadFullResource();
    expect(composite.isFullyLoaded).toBe(true);
    expect(composite.allImages).toContain(extra);
  });

  test('tracks activation time when zoom switches active layer', () => {
    const high = createImage('high', 100, 100);
    const mid = createImage('mid', 50, 50);
    const low = createImage('low', 25, 25);

    const composite = new CompositeResource({
      id: 'comp',
      width: 100,
      height: 100,
      images: [high, mid, low],
      renderOptions: {
        minSize: 0,
        maxImageSize: 99999,
        renderLayers: 2,
        renderSmallestFallback: true,
        layerPolicy: 'fallback-only',
        fadeInMs: 300,
      },
    });

    for (const update of composite.getScheduledUpdates(DnaFactory.singleBox(100, 100), 1)) {
      update();
    }

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    composite.getAllPointsAt(DnaFactory.singleBox(100, 100), undefined, 1);

    expect(composite.isImageActive(high)).toBe(true);
    expect(composite.getImageActivatedAt(high)).toBe(700);
    expect(composite.getImageActivatedAt(mid)).toBeUndefined();

    nowSpy.mockReturnValue(1300);
    composite.getAllPointsAt(DnaFactory.singleBox(100, 100), undefined, 0.5);

    expect(composite.isImageActive(mid)).toBe(true);
    expect(composite.getImageActivatedAt(mid)).toBe(1300);
    expect(composite.getImageActivatedAt(high)).toBeUndefined();

    nowSpy.mockRestore();
  });

  describe('minScaleGap', () => {
    // Levels whose scales are closer together than the gap are merged: only one is kept.
    function createLevels(scales: number[]) {
      return scales.map((scale) => {
        const points = DnaFactory.singleBox(1000 / scale, 1000 / scale);
        return new TiledImage({
          url: `https://example.org/level-${scale}`,
          scaleFactor: scale,
          points,
          displayPoints: points,
          tileWidth: 1000 / scale,
          tileHeight: 1000 / scale,
          width: 1000,
          height: 1000,
          columns: 1,
          rows: 1,
        });
      });
    }

    test('merges close scales by default (IIIF scale factors)', () => {
      const composite = new CompositeResource({
        id: 'default',
        width: 1000,
        height: 1000,
        images: createLevels([0.1, 0.2, 0.4]),
        renderOptions: { minSize: 0 },
      });
      composite._sortByScales();
      expect(composite.images.length).toBeLessThan(3);
    });

    test('keeps fractional scales when minScaleGap is 0', () => {
      const composite = new CompositeResource({
        id: 'fine',
        width: 1000,
        height: 1000,
        images: createLevels([0.1, 0.2, 0.4]),
        renderOptions: { minSize: 0, minScaleGap: 0 },
      });
      composite._sortByScales();
      expect(composite.images.map((image) => image.display.scale)).toEqual([0.1, 0.2, 0.4]);
    });

    test('can be changed through applyProps', () => {
      const composite = new CompositeResource({
        id: 'late',
        width: 1000,
        height: 1000,
        images: createLevels([0.1, 0.2, 0.4]),
        renderOptions: { minSize: 0 },
      });
      composite._sortByScales();
      expect(composite.images.length).toBeLessThan(3);

      composite.applyProps({ minScaleGap: 0 });
      composite._sortByScales();
      expect(composite.images).toHaveLength(3);
    });
  });
});
