/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';

function createMockContext() {
  return {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
  } as any;
}

function createRenderer(options?: ConstructorParameters<typeof CanvasRenderer>[1]) {
  const context = createMockContext();
  const canvas = {
    width: 256,
    height: 256,
    style: { transition: '', opacity: '1' },
    dataset: {},
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 256, height: 256 }),
    getContext: vi.fn(() => context),
  } as any as HTMLCanvasElement;
  return { renderer: new CanvasRenderer(canvas, options), context };
}

function createImage(id: string, rotation?: number, opacity = 1) {
  const image = new SingleImage();
  image.applyProps({
    id,
    uri: `https://example.org/${id}.jpg`,
    target: { width: 100, height: 100 },
    display: { width: 100, height: 100, rotation },
    style: { opacity },
  } as any);
  return image;
}

function setCompositeState(
  image: SingleImage | TiledImage,
  active: boolean,
  options: Partial<{
    layerPolicy: 'fallback-only' | 'always-blend' | 'active-only';
    loadingBias: 'balanced' | 'speed' | 'data';
    prefetchRadius: number;
    fadeInMs: number;
    fadeFallbackTiles: boolean;
  }> = {}
) {
  image.__parent = {
    renderOptions: {
      layerPolicy: 'fallback-only',
      loadingBias: 'balanced',
      prefetchRadius: 1,
      fadeInMs: 0,
      fadeFallbackTiles: false,
      ...options,
    },
    isImageActive: () => active,
  } as any;
}

describe('Canvas image loading behavior', () => {
  test('inactive loaded layer draws without requesting new load', () => {
    const { renderer, context } = createRenderer({ readiness: 'immediate' });
    const image = createImage('fallback');
    setCompositeState(image, false);

    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'fallback-0';
    buffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() };
    const cachedCanvas = {} as HTMLCanvasElement;
    renderer.hostCache.set('fallback-0', cachedCanvas);

    const scheduleSpy = vi.spyOn(renderer, 'schedulePaintToCanvas');
    renderer.paint(image, 0, 0, 0, 100, 100);

    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(context.drawImage.mock.calls[0][0]).toBe(cachedCanvas);
  });

  test('active layer requests missing tile and then overdraws fallback when decoded', () => {
    const { renderer, context } = createRenderer({ readiness: 'immediate' });
    const fallback = createImage('fallback');
    const active = createImage('active');
    setCompositeState(fallback, false);
    setCompositeState(active, true);

    renderer.prepareLayer(fallback, fallback.points);
    renderer.prepareLayer(active, active.points);

    const fallbackBuffer = fallback.__host.canvas;
    fallbackBuffer.canvases[0] = 'fallback-0';
    fallbackBuffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() };
    const fallbackCanvas = {} as HTMLCanvasElement;
    renderer.hostCache.set('fallback-0', fallbackCanvas);

    const activeBuffer = active.__host.canvas;
    const scheduleSpy = vi.spyOn(renderer, 'schedulePaintToCanvas');

    renderer.paint(fallback, 0, 0, 0, 100, 100);
    renderer.paint(active, 0, 0, 0, 100, 100);

    expect(scheduleSpy).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledTimes(1);

    activeBuffer.canvases[0] = 'active-0';
    activeBuffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() };
    const activeCanvas = {} as HTMLCanvasElement;
    renderer.hostCache.set('active-0', activeCanvas);

    renderer.paint(fallback, 0, 0, 0, 100, 100);
    renderer.paint(active, 0, 0, 0, 100, 100);

    expect(context.drawImage).toHaveBeenCalledTimes(3);
    expect(context.drawImage.mock.calls[1][0]).toBe(fallbackCanvas);
    expect(context.drawImage.mock.calls[2][0]).toBe(activeCanvas);
  });

  test('restores canvas state on early returns (opacity and first-meaningful-paint)', () => {
    const { renderer, context } = createRenderer();

    const transparent = createImage('transparent', 30, 0);
    renderer.prepareLayer(transparent, transparent.points);
    renderer.paint(transparent, 0, 0, 0, 100, 100);
    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(context.globalAlpha).toBe(1);

    const notReady = createImage('not-ready', 45, 1);
    renderer.prepareLayer(notReady, notReady.points);
    renderer.paint(notReady, 0, 0, 0, 100, 100);
    expect(context.restore).toHaveBeenCalledTimes(2);
    expect(context.globalAlpha).toBe(1);
  });

  test('balanced prefetch ring is capped and concurrency is bounded', () => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    expect(renderer.parallelTasks).toBe(6);

    const tiled = TiledImage.fromTile(
      'https://example.org/tiled',
      { width: 1000, height: 1000 },
      { width: 100, height: 100 },
      1
    );
    setCompositeState(tiled, true, { loadingBias: 'speed', prefetchRadius: 3 });
    renderer.prepareLayer(tiled, tiled.points);
    const buffer = tiled.__host.canvas;

    const spy = vi.spyOn(renderer, 'schedulePaintToCanvas').mockImplementation(() => true);
    (renderer as any).schedulePrefetchNeighbours(buffer, tiled, 55, 10);

    expect(spy).toHaveBeenCalledTimes(renderer.maxPrefetchPerFrame);
    expect((renderer as any).framePrefetchCount).toBe(renderer.maxPrefetchPerFrame);
  });

  test('pendingUpdate stays true while a rendered tile is still fading', () => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    const image = createImage('fade');
    setCompositeState(image, true, { fadeInMs: 1000 });

    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'fade-0';
    buffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() };
    renderer.hostCache.set('fade-0', {} as HTMLCanvasElement);

    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(renderer.pendingUpdate()).toBe(true);
  });
});
