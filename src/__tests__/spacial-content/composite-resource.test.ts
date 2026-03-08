/** @vitest-environment happy-dom */

import { DnaFactory } from '@atlas-viewer/dna';
import { vi } from 'vitest';
import { CompositeResource } from '../../spacial-content/composite-resource';
import { SingleImage } from '../../spacial-content/single-image';

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
});
