/** @vitest-environment happy-dom */

import { DnaFactory } from '@atlas-viewer/dna';
import { describe, expect, test, vi } from 'vitest';
import { NavigatorRenderer } from '../../modules/navigator-renderer/navigator-renderer';
import { SingleImage } from '../../spacial-content/single-image';

function createMockContext() {
  return {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as any;
}

function createMockCanvas(context: any, width = 100, height = 100): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: vi.fn(() => context),
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width, height }),
  } as any as HTMLCanvasElement;
}

describe('NavigatorRenderer clipping', () => {
  test('clips image layers to composite bounds when clipToBounds is enabled', () => {
    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const renderer = new NavigatorRenderer(canvas, { drawFallbackBoxes: false });
    const image = new SingleImage();
    image.applyProps({
      id: 'navigator-clip',
      uri: 'https://example.org/navigator-clip.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);
    image.__parent = {
      points: DnaFactory.singleBox(40, 40, 10, 20),
      renderOptions: {
        clipToBounds: true,
      },
    } as any;

    const preview = {} as HTMLImageElement;
    (renderer as any).previewImageCache.set(image.uri, {
      image: preview,
      status: 'loaded',
    });

    const world = {
      width: 100,
      height: 100,
      zones: [],
      getActiveZone: () => undefined,
      getPointsAt: () => [[image, DnaFactory.singleBox(80, 80, 0, 0), undefined]],
    } as any;
    const target = DnaFactory.singleBox(100, 100, 0, 0);

    renderer.beforeFrame(world);
    renderer.afterFrame(world, 16, target);

    expect(baseContext.rect).toHaveBeenCalledWith(10, 20, 40, 40);
    expect(baseContext.clip).toHaveBeenCalledTimes(1);
    expect(baseContext.restore).toHaveBeenCalled();
    createElementSpy.mockRestore();
  });

  test('does not clip when composite clipToBounds is disabled', () => {
    const mainContext = createMockContext();
    const baseContext = createMockContext();
    const canvas = createMockCanvas(mainContext);
    const baseCanvas = createMockCanvas(baseContext);

    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() === 'canvas') {
        return baseCanvas as any;
      }
      return originalCreateElement(tagName);
    });

    const renderer = new NavigatorRenderer(canvas, { drawFallbackBoxes: false });
    const image = new SingleImage();
    image.applyProps({
      id: 'navigator-no-clip',
      uri: 'https://example.org/navigator-no-clip.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);
    image.__parent = {
      points: DnaFactory.singleBox(40, 40, 10, 20),
      renderOptions: {
        clipToBounds: false,
      },
    } as any;

    (renderer as any).previewImageCache.set(image.uri, {
      image: {} as HTMLImageElement,
      status: 'loaded',
    });

    const world = {
      width: 100,
      height: 100,
      zones: [],
      getActiveZone: () => undefined,
      getPointsAt: () => [[image, DnaFactory.singleBox(80, 80, 0, 0), undefined]],
    } as any;
    const target = DnaFactory.singleBox(100, 100, 0, 0);

    renderer.beforeFrame(world);
    renderer.afterFrame(world, 16, target);

    expect(baseContext.clip).not.toHaveBeenCalled();
    createElementSpy.mockRestore();
  });
});
