/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';
import { resolveImageLoadingConfig } from '../../modules/shared/image-loading-config';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const defaultHookOptions = {
  filters: {
    grayscale: 0,
    contrast: 0,
    brightness: 0,
    saturate: 0,
    sepia: 0,
    invert: 0,
    hueRotate: 0,
    blur: 0,
  },
  enableFilters: false,
};

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
    rect: vi.fn(),
    clip: vi.fn(),
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
    fadeOnLayerChange: boolean;
    clipToBounds: boolean;
    activatedAt: number;
  }> = {}
) {
  const { activatedAt, ...renderOptions } = options;
  image.__parent = {
    renderOptions: {
      layerPolicy: 'fallback-only',
      loadingBias: 'balanced',
      prefetchRadius: 1,
      fadeInMs: 0,
      fadeFallbackTiles: false,
      fadeOnLayerChange: false,
      clipToBounds: false,
      ...renderOptions,
    },
    isImageActive: () => active,
    getImageActivatedAt: () => (active && typeof activatedAt === 'number' ? activatedAt : undefined),
  } as any;
}

describe('Canvas image loading behavior', () => {
  test('idle cancels pending loads, preserves tiles, and resumes without errors or retries', async () => {
    const onImageError = vi.fn();
    const { renderer } = createRenderer({ readiness: 'immediate', onImageError });
    const image = createImage('idle-request');
    renderer.prepareLayer(image, image.points);
    renderer.visible = [image];
    const cachedTile = document.createElement('canvas');
    renderer.hostCache.set('loaded-tile', cachedTile);
    const firstLoad = deferred<HTMLImageElement>();
    const secondLoad = deferred<HTMLImageElement>();
    const createRequest = vi.spyOn(renderer.imageRequestPool as any, 'createRequest')
      .mockImplementationOnce(() => firstLoad.promise).mockImplementationOnce(() => secondLoad.promise);

    renderer.schedulePaintToCanvas(image.__host.canvas, image, 0, 0);
    renderer._worker();
    const firstTask = renderer.currentTask;
    renderer.setIdle(true);
    expect(renderer.inFlightImageLoads.size).toBe(0);
    expect(renderer.hostCache.get('loaded-tile')).toBe(cachedTile);
    expect(renderer.pendingUpdate()).toBe(false);
    expect(renderer.schedulePaintToCanvas(image.__host.canvas, image, 0, 0)).toBe(false);
    renderer.doOffscreenWork();
    expect(createRequest).toHaveBeenCalledTimes(1);

    renderer.setIdle(false);
    expect(renderer.schedulePaintToCanvas(image.__host.canvas, image, 0, 0)).toBe(true);
    renderer._worker();
    const secondTask = renderer.currentTask;
    firstLoad.resolve({ naturalWidth: 100 } as HTMLImageElement);
    await firstTask;
    expect(renderer.inFlightImageLoads.size).toBe(1);
    secondLoad.resolve({ naturalWidth: 100 } as HTMLImageElement);
    await secondTask;
    expect(renderer.loadingQueue).toHaveLength(1);
    expect(renderer.loadingQueue[0].kind).toBe('decode');
    expect(image.__host.canvas.tiles[0].attempts || 0).toBe(0);
    expect(onImageError).not.toHaveBeenCalled();
    renderer.reset();
  });

  test.each([false, true])('reset releases tile canvases and allows images to reload (lruCache: %s)', (lruCache) => {
    const { renderer } = createRenderer({ readiness: 'immediate', lruCache });
    const image = createImage('reset-loaded');
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'tile';
    buffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() };
    const tile = document.createElement('canvas');
    tile.width = tile.height = 100;
    renderer.hostCache.set('tile', tile);
    renderer.visible = renderer.previousVisible = [image];
    renderer.pendingDrawCall = true;

    renderer.reset();
    renderer.reset();

    expect(renderer.hostCache.get('tile')).toBeUndefined();
    expect([tile.width, tile.height]).toEqual([0, 0]);
    expect(renderer.visible).toEqual([]);
    expect(renderer.previousVisible).toEqual([]);
    expect(renderer.pendingUpdate()).toBe(false);
    renderer.paint(image, 0, 0, 0, 100, 100);
    expect(renderer.loadingQueue).toHaveLength(1);
    renderer.reset();
  });

  test('sequential viewers release source images without affecting an active viewer', async () => {
    const { renderer: active } = createRenderer();
    const source = { naturalWidth: 100 } as HTMLImageElement;
    vi.spyOn(active.imageRequestPool as any, 'createRequest').mockResolvedValue(source);
    const activeRequest = active.imageRequestPool.acquire('https://example.org/shared.jpg', 'active');
    await activeRequest.promise;

    for (let index = 0; index < 60; index++) {
      const { renderer } = createRenderer();
      const createRequest = vi.spyOn(renderer.imageRequestPool as any, 'createRequest').mockResolvedValue(source);
      for (const url of ['https://example.org/shared.jpg', `https://example.org/${index}.jpg`]) {
        const request = renderer.imageRequestPool.acquire(url, 'viewer');
        await request.promise;
        request.release();
      }
      renderer.reset();
      expect(createRequest).toHaveBeenCalledTimes(2);
      expect((renderer.imageRequestPool as any).inFlight.size).toBe(0);
      expect((renderer.imageRequestPool as any).knownConsumers.size).toBe(0);
    }

    await expect(activeRequest.promise).resolves.toBe(source);
    expect(source.naturalWidth).toBe(100);
    active.reset();
  });

  test.each(['resolve', 'reject'])('ignores a request that settles after reset: %s', async (outcome) => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    const image = createImage('reset-pending');
    renderer.prepareLayer(image, image.points);
    renderer.visible = [image];
    const d = deferred<HTMLImageElement>();
    const release = vi.fn();
    const acquire = vi.spyOn(renderer.imageRequestPool, 'acquire').mockReturnValue({
      requestKey: 'old', release, promise: d.promise,
    });
    renderer.schedulePaintToCanvas(image.__host.canvas, image, 0, 0, false);
    renderer._worker();
    const oldTask = renderer.currentTask;
    renderer.reset();

    // Reuse the same renderer and image before the old request settles.
    const replacement = deferred<HTMLImageElement>();
    const replacementRelease = vi.fn();
    acquire.mockReturnValue({ requestKey: 'new', release: replacementRelease, promise: replacement.promise });
    renderer.visible = [image];
    expect(renderer.schedulePaintToCanvas(image.__host.canvas, image, 0, 0, false)).toBe(true);
    renderer._worker();
    const newTask = renderer.currentTask;
    if (outcome === 'resolve') d.resolve({ naturalWidth: 100 } as HTMLImageElement);
    else d.reject(new Error('late failure'));
    await oldTask;

    expect(release).toHaveBeenCalledTimes(1);
    expect(replacementRelease).not.toHaveBeenCalled();
    expect(renderer.tasksRunning).toBe(1);
    expect(renderer.loadingQueue).toHaveLength(0);
    expect(renderer.inFlightImageLoads.size).toBe(1);
    renderer.reset();
    replacement.resolve({ naturalWidth: 100 } as HTMLImageElement);
    await newTask;
    expect(renderer.pendingUpdate()).toBe(false);
  });

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

  test('loads lower-quality composite layer first even when tile priority differs', () => {
    const { renderer } = createRenderer({ readiness: 'immediate', imageLoading: { maxConcurrentRequests: 1 } });
    const acquire = vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockImplementation((url: string) => ({
      requestKey: url,
      release: vi.fn(),
      promise: new Promise(() => {}),
    }));

    const high = new SingleImage();
    high.applyProps({
      id: 'high',
      uri: 'https://example.com/high.jpg',
      target: { width: 100, height: 100 },
      display: { width: 400, height: 400 },
      style: { opacity: 1 },
    } as any);

    const low = new SingleImage();
    low.applyProps({
      id: 'low',
      uri: 'https://example.com/low.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 1 },
    } as any);

    const compositeParent = {
      renderOptions: {
        layerPolicy: 'always-blend',
        loadingBias: 'balanced',
        prefetchRadius: 1,
        fadeInMs: 0,
        fadeFallbackTiles: false,
        fadeOnLayerChange: false,
        clipToBounds: false,
      },
      isImageActive: () => true,
    } as any;
    high.__parent = compositeParent;
    low.__parent = compositeParent;

    renderer.prepareLayer(high, high.points);
    renderer.prepareLayer(low, low.points);
    (renderer as any).visible = [high, low];

    renderer.schedulePaintToCanvas(high.__host.canvas, high, 0, 0, false);
    renderer.schedulePaintToCanvas(low.__host.canvas, low, 0, 1000, false);
    renderer.afterFrame({
      hasActiveZone: () => true,
      getObjects: () => [],
    } as any);

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0]).toBe('https://example.com/low.jpg');
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
    expect(renderer.parallelTasks).toBe(resolveImageLoadingConfig().maxConcurrentRequests);

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

  test('resetImageFadeState re-arms fade for already decoded visible tiles', () => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    const image = createImage('reset-fade');
    setCompositeState(image, true, { fadeInMs: 1000 });

    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'reset-fade-0';
    buffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() - 5000, skipFade: true };
    renderer.hostCache.set('reset-fade-0', {} as HTMLCanvasElement);

    renderer.paint(image, 0, 0, 0, 100, 100);
    renderer.resetImageFadeState();

    expect(buffer.tiles[0].skipFade).toBe(false);
    expect(buffer.tiles[0].loadedAt).toBeGreaterThan(performance.now() - 100);
    expect(renderer.pendingUpdate()).toBe(true);
  });

  test('starts fade timing on first visible draw instead of decode time', () => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    const image = createImage('visible-fade-start');
    setCompositeState(image, true, { fadeInMs: 300 });

    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'visible-fade-start-0';
    buffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() - 5000 };
    renderer.hostCache.set('visible-fade-start-0', {} as HTMLCanvasElement);

    renderer.paint(image, 0, 0, 0, 100, 100);

    expect(buffer.tiles[0].fadeStartedAt).toBeGreaterThan(performance.now() - 100);
    expect((renderer as any).hasTilesFading).toBe(true);
  });

  test('fades a newly active layer even when the tile was decoded earlier', () => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    const image = createImage('active-layer-fade');
    setCompositeState(image, true, { fadeInMs: 1000, fadeOnLayerChange: true, activatedAt: performance.now() - 20 });

    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'active-layer-fade-0';
    buffer.tiles[0] = { state: 'decoded', loadedAt: performance.now() - 5000 };
    renderer.hostCache.set('active-layer-fade-0', {} as HTMLCanvasElement);

    renderer.paint(image, 0, 0, 0, 100, 100);

    expect((renderer as any).hasTilesFading).toBe(true);
    expect(renderer.pendingUpdate()).toBe(true);
  });

  test('clips composite layers to parent bounds when clipToBounds is enabled', () => {
    const { renderer, context } = createRenderer({ readiness: 'immediate' });
    const image = createImage('clip-layer');
    setCompositeState(image, true, { clipToBounds: true });

    renderer.prepareLayer(image, new Float32Array([1, 10, 20, 110, 120]) as any);
    renderer.finishLayer();

    expect(context.rect).toHaveBeenCalledWith(10, 20, 100, 100);
    expect(context.clip).toHaveBeenCalledTimes(1);
  });

  test('uses adaptive defaults unless explicit imageLoading overrides are set', () => {
    const expected = resolveImageLoadingConfig();
    const auto = createRenderer({ readiness: 'immediate' }).renderer;
    expect(auto.parallelTasks).toBe(expected.maxConcurrentRequests);
    expect(auto.maxPrefetchPerFrame).toBe(expected.maxPrefetchPerFrame);

    const manual = createRenderer({
      readiness: 'immediate',
      imageLoading: { maxConcurrentRequests: 9, maxPrefetchPerFrame: 4 },
    }).renderer;
    expect(manual.parallelTasks).toBe(9);
    expect(manual.maxPrefetchPerFrame).toBe(4);
  });

  test('retries failed tile requests with backoff and emits error metadata', async () => {
    const onImageError = vi.fn();
    const { renderer } = createRenderer({
      readiness: 'immediate',
      onImageError,
      imageLoading: {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 100,
        jitterRatio: 0,
        errorRetryIntervalMs: 1000,
      },
    });
    const image = createImage('retry');
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    (renderer as any).visible = [image];

    vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
      requestKey: 'retry',
      release: vi.fn(),
      promise: Promise.reject(new Error('network')),
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const scheduled = renderer.schedulePaintToCanvas(buffer, image, 0, 10, false);
      expect(scheduled).toBe(true);
      const task = (renderer as any).loadingQueue.pop();
      await task.task();

      const state = buffer.tiles[0];
      expect(state.attempts).toBe(attempt);
      expect(onImageError.mock.calls[attempt - 1][0].attempt).toBe(attempt);
      expect(onImageError.mock.calls[attempt - 1][0].renderer).toBe('canvas');
      if (attempt < 3) {
        expect(state.state).toBe('idle');
        expect(onImageError.mock.calls[attempt - 1][0].willRetry).toBe(true);
      } else {
        expect(state.state).toBe('error');
        expect(onImageError.mock.calls[attempt - 1][0].willRetry).toBe(false);
      }

      // Simulate waiting for cooldown between attempts.
      state.nextRetryAt = performance.now() - 1;
    }
  });

  test('prunes stale in-flight work and avoids stale decode commit', async () => {
    const { renderer } = createRenderer({ readiness: 'immediate' });
    const image = createImage('cancel');
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    (renderer as any).visible = [image];

    const d = deferred<HTMLImageElement>();
    const release = vi.fn();
    vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
      requestKey: 'cancel',
      release,
      promise: d.promise,
    });

    renderer.schedulePaintToCanvas(buffer, image, 0, 10, false);
    const task = (renderer as any).loadingQueue.pop();
    const running = task.task();

    const tileKey = `${image.id}::${image.display.scale}::0`;
    expect((renderer as any).inFlightImageLoads.has(tileKey)).toBe(true);

    (renderer as any).requiredTileKeys.clear();
    (renderer as any).requiredPrefetchTileKeys.clear();
    (renderer as any).pruneStaleTileWork();
    expect(release).toHaveBeenCalledTimes(1);

    d.resolve({ naturalWidth: 100 } as HTMLImageElement);
    await running;

    expect((renderer as any).loadingQueue.length).toBe(0);
    expect(buffer.tiles[0].state).toBe('idle');
  });

  test('batches decoded tile reveal across consecutive frames', () => {
    const { renderer } = createRenderer({
      readiness: 'immediate',
      imageLoading: { revealDelayFrames: 1, revealBatchWindowFrames: 1 },
    });
    const image = createImage('batched');
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    const tileKey = `${image.id}::${image.display.scale}::0`;

    buffer.tiles[0] = { state: 'decoded', loadedAt: undefined };
    (renderer as any).pendingTileReveals.set(tileKey, {
      imageBuffer: buffer,
      index: 0,
      queuedFrame: 0,
    });

    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    expect(buffer.tiles[0].loadedAt).toBeTypeOf('number');
  });

  test.each([false, true])('loading probes preserve a decoded tile awaiting reveal (prefetch: %s)', (prefetch) => {
    const { renderer } = createRenderer({
      readiness: 'immediate',
      imageLoading: { revealDelayFrames: 1, revealBatchWindowFrames: 1 },
    });
    const image = createImage('pending-probe');
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    const tileKey = `${image.id}::${image.display.scale}::0`;
    buffer.tiles[0] = { state: 'decoded', loadedAt: undefined };
    renderer.pendingTileReveals.set(tileKey, { imageBuffer: buffer, index: 0, queuedFrame: 0 });

    expect(renderer.schedulePaintToCanvas(buffer, image, 0, 0, prefetch)).toBe(false);
    renderer.beforeFrame({} as any, 16, {} as any, { ...defaultHookOptions });
    expect(buffer.tiles[0].loadedAt).toBeTypeOf('number');
    renderer.reset();
  });

  test('reveals visible tiles while another request is still pending', () => {
    vi.useFakeTimers();
    const { renderer } = createRenderer();
    try {
      renderer.visible = [createImage('visible')];
      renderer.tasksRunning = 1;
      expect(renderer.pendingUpdate()).toBe(true);
      vi.advanceTimersByTime(1000);
      expect(renderer.firstMeaningfulPaint).toBe(true);
      expect(renderer.pendingUpdate()).toBe(true);
      expect(renderer.fallbackRevealTimeout).toBeNull();
    } finally {
      renderer.reset();
      vi.useRealTimers();
    }
  });

  test('pendingUpdate remains active while tile reveals are queued', () => {
    const { renderer } = createRenderer({
      readiness: 'immediate',
      imageLoading: { revealDelayFrames: 2, revealBatchWindowFrames: 1 },
    });
    const image = createImage('pending-reveal');
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    const tileKey = `${image.id}::${image.display.scale}::0`;
    buffer.tiles[0] = { state: 'decoded', loadedAt: undefined };
    (renderer as any).pendingTileReveals.set(tileKey, {
      imageBuffer: buffer,
      index: 0,
      queuedFrame: 1,
    });

    expect(renderer.pendingUpdate()).toBe(true);
  });

  test('skips fade for quickly loaded tiles', () => {
    const { renderer } = createRenderer({
      readiness: 'immediate',
      imageLoading: { skipFadeIfLoadedWithinMs: 500, revealDelayFrames: 0, revealBatchWindowFrames: 0 },
    });
    const image = createImage('quick-fade-skip');
    setCompositeState(image, true, { fadeInMs: 1000 });
    renderer.prepareLayer(image, image.points);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'quick-fade-skip-0';
    renderer.hostCache.set('quick-fade-skip-0', {} as HTMLCanvasElement);
    buffer.tiles[0] = {
      state: 'decoded',
      requestedAt: performance.now() - 20,
      loadedAt: performance.now(),
      skipFade: true,
    };

    renderer.paint(image, 0, 0, 0, 100, 100);
    expect((renderer as any).hasTilesFading).toBe(false);
  });

  test('resetReadyState clears first meaningful paint in non-immediate mode', () => {
    const { renderer } = createRenderer();
    renderer.firstMeaningfulPaint = true;

    renderer.resetReadyState();

    expect(renderer.firstMeaningfulPaint).toBe(false);
  });
});
