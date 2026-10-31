/** @vitest-environment happy-dom */

import { DnaFactory, type Strand } from '@atlas-viewer/dna';
import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';
import { createMapProjection } from '../../modules/maps/projection';
import { createWarpAdapterController } from '../../modules/maps/warped/adapter';
import { buildWarpMesh } from '../../modules/maps/warped/mesh';
import { createWarpTransformer } from '../../modules/maps/warped/transformer';
import type { WarpControlPoint } from '../../modules/maps/warped/types';
import { isWebGLImageFastPathCandidate } from '../../modules/webgl-renderer/webgl-eligibility';
import { MapObject } from '../../modules/react-reconciler/components/MapObject';
import { MapWarpedImage } from '../../modules/react-reconciler/components/MapWarpedImage';
import { ReactAtlas } from '../../modules/react-reconciler/reconciler';
import type { Renderer } from '../../renderer/renderer';
import { Runtime } from '../../renderer/runtime';
import { WarpedImage } from '../../spacial-content/warped-image';
import { CompositeResource } from '../../spacial-content/composite-resource';
import { WarpedMapResource } from '../../spacial-content/warped-map-layer';
import { WarpedMapLayer } from '../../modules/react-reconciler/components/WarpedMapLayer';
import { TileSet } from '../../modules/react-reconciler/components/TileSet';
import { WorldObject } from '../../world-objects/world-object';
import { World } from '../../world';
import type { Paint } from '../../world-objects/paint';

const BOUNDS = { west: -74.3, south: 40.45, east: -73.6, north: 40.95 };
const projection = createMapProjection({ bounds: BOUNDS, width: 2400, height: 1600 });

const controlPoints: WarpControlPoint[] = [
  { image: { x: 0, y: 0 }, map: { lng: -74.08, lat: 40.9 } },
  { image: { x: 1000, y: 0 }, map: { lng: -73.85, lat: 40.88 } },
  { image: { x: 1000, y: 700 }, map: { lng: -73.86, lat: 40.7 } },
  { image: { x: 0, y: 700 }, map: { lng: -74.1, lat: 40.72 } },
];

function makeImage(type: 'affine' | 'projective' | 'thinPlateSpline', tiles?: any[], extra: any = {}) {
  const transformer = createWarpTransformer(controlPoints, type);
  return new WarpedImage({
    id: `warped-${type}`,
    tiles: tiles || [{ x1: 0, y1: 0, x2: 1000, y2: 700, url: 'https://example.org/image.jpg' }],
    imageWidth: 1000,
    imageHeight: 700,
    transformer,
    lngLatToWorld: projection.lngLatToWorld,
    transformationType: type,
    ...extra,
  });
}

describe('buildWarpMesh', () => {
  test('maps masks to decoded tile pixels and culls tiles outside the mask bounds', () => {
    const image = makeImage(
      'affine',
      [
        { x1: 0, y1: 0, x2: 500, y2: 700, pixelWidth: 250, pixelHeight: 350, url: 'left' },
        { x1: 500, y1: 0, x2: 1000, y2: 700, pixelWidth: 250, pixelHeight: 350, url: 'right' },
      ],
      {
        resourceMask: [
          [600, 100],
          [900, 100],
          [900, 600],
          [600, 600],
        ],
      }
    );
    expect(image.mesh[0].indices).toHaveLength(0);
    expect(image.points[0]).toBe(0);
    expect(image.points[5]).toBe(1);
    expect(Array.from(image.mesh[1].resourceMask!)).toEqual([50, 50, 200, 50, 200, 300, 50, 300]);
  });

  test('rejects degenerate and non-finite masks', () => {
    for (const resourceMask of [
      [],
      [
        [0, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      [
        [0, 0],
        [1, Infinity],
        [2, 0],
      ],
    ]) {
      expect(() => makeImage('affine', undefined, { resourceMask })).toThrow(/mask/i);
    }
  });

  test('affine transformations are a single draw of two triangles', () => {
    const image = makeImage('affine');
    const [tile] = image.mesh;
    expect(tile.indices).toHaveLength(6);
    expect(tile.affine).toBeDefined();
  });

  test('non-affine transformations are subdivided', () => {
    const projective = makeImage('projective').mesh[0];
    const spline = makeImage('thinPlateSpline').mesh[0];
    expect(projective.affine).toBeUndefined();
    expect(projective.indices.length).toBeGreaterThan(6);
    expect(spline.indices.length).toBeGreaterThan(projective.indices.length);
  });

  test('mesh corners land on the projected control points', () => {
    const image = makeImage('projective');
    const tile = image.mesh[0];
    const topLeft = projection.lngLatToWorld(-74.08, 40.9);
    // Vertex 0 is the top-left of the image, relative to the tile bounds.
    expect(tile.bounds.x1 + tile.dst[0]).toBeCloseTo(topLeft.x, 3);
    expect(tile.bounds.y1 + tile.dst[1]).toBeCloseTo(topLeft.y, 3);
  });

  test('tile bounds contain every vertex', () => {
    const tile = makeImage('thinPlateSpline').mesh[0];
    const width = tile.bounds.x2 - tile.bounds.x1;
    const height = tile.bounds.y2 - tile.bounds.y1;
    for (let i = 0; i < tile.dst.length; i += 2) {
      expect(tile.dst[i]).toBeGreaterThanOrEqual(-1e-3);
      expect(tile.dst[i]).toBeLessThanOrEqual(width + 1e-3);
      expect(tile.dst[i + 1]).toBeGreaterThanOrEqual(-1e-3);
      expect(tile.dst[i + 1]).toBeLessThanOrEqual(height + 1e-3);
    }
  });

  test('drops triangles with vertices that can not be projected', () => {
    const transformer = createWarpTransformer(controlPoints, 'affine');
    const broken = {
      ...transformer,
      type: 'custom' as const,
      toGeo: (x: number) => (x > 500 ? [NaN, NaN] : transformer.toGeo(x, 0)),
    } as any;
    const [tile] = buildWarpMesh({
      tiles: [{ x1: 0, y1: 0, x2: 1000, y2: 700 }],
      imageWidth: 1000,
      imageHeight: 700,
      transformer: broken,
      lngLatToWorld: projection.lngLatToWorld,
      resolution: 4,
    });
    expect(tile.indices.length).toBeGreaterThan(0);
    // Right hand half is gone.
    expect(tile.indices.length).toBeLessThan(4 * 4 * 6);
  });
});

describe('WarpedImage', () => {
  test('is a tiled image positioned by its mesh, with tile pixel display points', () => {
    const image = makeImage(
      'affine',
      [
        { x1: 0, y1: 0, x2: 500, y2: 700, pixelWidth: 250, pixelHeight: 350, url: 'a' },
        { x1: 500, y1: 0, x2: 1000, y2: 700, pixelWidth: 250, pixelHeight: 350, url: 'b' },
      ],
      { scaleFactor: 2 }
    );

    expect(image.getImageUrl(0)).toBe('a');
    expect(image.getImageUrl(1)).toBe('b');
    // Canvas sizing uses decoded pixels.
    expect(image.display.points[3] - image.display.points[1]).toBe(250);
    // Culling uses where each tile lands on the map.
    const left = image.points.slice(0, 5);
    const right = image.points.slice(5, 10);
    expect(left[0]).toBe(1);
    expect(right[1]).toBeGreaterThan(left[1]);
    expect(isWebGLImageFastPathCandidate(image, 0)).toBe(false);
  });

  test('re-fitting keeps tile identity and updates positions in place', () => {
    const image = makeImage('affine');
    const pointsRef = image.points;
    const before = Array.from(image.points);
    const scale = image.display.scale;
    const revision = image.__revision;

    const moved = controlPoints.map((point) => ({
      ...point,
      map: { lng: point.map.lng + 0.05, lat: point.map.lat },
    }));
    image.setTransform({
      transformer: createWarpTransformer(moved, 'affine'),
      lngLatToWorld: projection.lngLatToWorld,
      transformationType: 'affine',
    });

    expect(image.points).toBe(pointsRef);
    expect(image.points[1]).toBeGreaterThan(before[1]);
    expect(image.display.scale).toBeCloseTo(scale, 10);
    expect(image.__revision).toBeGreaterThan(revision);
  });

  test('applyProps with a new transformer re-fits', () => {
    const image = makeImage('affine');
    const before = image.points[1];
    const moved = controlPoints.map((point) => ({
      ...point,
      map: { lng: point.map.lng + 0.1, lat: point.map.lat },
    }));
    image.applyProps({
      transformer: createWarpTransformer(moved, 'affine'),
      lngLatToWorld: projection.lngLatToWorld,
      transformationType: 'affine',
    });
    expect(image.points[1]).toBeGreaterThan(before);
  });
});

describe('canvas rendering of warped tiles', () => {
  function createRenderer() {
    const context: any = {
      imageSmoothingEnabled: false,
      globalAlpha: 1,
      getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      transform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
    };
    const canvas = {
      width: 256,
      height: 256,
      style: {},
      dataset: {},
      getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 256, height: 256 }),
      getContext: vi.fn(() => context),
    } as any as HTMLCanvasElement;
    const renderer = new CanvasRenderer(canvas);
    (renderer as any).ctx = context;
    return { renderer, context };
  }

  test('affine tiles are one transformed draw without clipping', () => {
    const { renderer, context } = createRenderer();
    const tile = makeImage('affine').mesh[0];
    const source = {} as CanvasImageSource;

    (renderer as any).drawWarpedTile(source, tile, 10, 20, 200, 100);

    expect(context.transform).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(context.clip).not.toHaveBeenCalled();
    expect(context.imageSmoothingEnabled).toBe(true);
  });

  test('destination masks clip in image coordinates before applying texture transforms', () => {
    const { renderer, context } = createRenderer();
    const tile = makeImage('affine').mesh[0];
    tile.destinationMask = Float32Array.from([0, 0, 30, 0, 15, 40]);
    (renderer as any).drawWarpedTile(
      {},
      tile,
      10,
      20,
      (tile.bounds.x2 - tile.bounds.x1) * 2,
      (tile.bounds.y2 - tile.bounds.y1) * 2
    );
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(context.lineTo).toHaveBeenCalledWith(70, 20);
    expect(context.lineTo).toHaveBeenCalledWith(40, 100);
    expect(context.clip.mock.invocationCallOrder[0]).toBeLessThan(context.transform.mock.invocationCallOrder[0]);
    expect(context.save).toHaveBeenCalledTimes(2);
    expect(context.restore).toHaveBeenCalledTimes(2);
  });

  test('translucent overlays composite once after drawing all mesh triangles', () => {
    const { renderer, context } = createRenderer();
    const scratch = createRenderer().context;
    const canvas = { width: 256, height: 256, getContext: () => scratch };
    (renderer as any).warpCompositeCanvas = canvas;
    const image = makeImage('thinPlateSpline');
    (image as any).compositeOpacity = true;
    image.style.opacity = 0.4;
    image.__host = { canvas: {} };
    renderer.prepareLayer(image, image.points);
    expect((renderer as any).ctx).toBe(scratch);
    const tile = image.mesh[0];
    (renderer as any).drawWarpedTile({}, tile, 0, 0, 200, 100);
    expect(scratch.drawImage.mock.calls.length).toBeGreaterThan(2);
    expect(scratch.globalAlpha).toBe(1);
    expect(context.drawImage).not.toHaveBeenCalled();
    let alpha = 0;
    context.drawImage.mockImplementation(() => {
      alpha = context.globalAlpha;
    });
    renderer.finishLayer();
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(canvas, 0, 0);
    expect(alpha).toBe(0.4);
    expect((renderer as any).ctx).toBe(context);
  });

  test('mesh tiles clip and draw every triangle', () => {
    const { renderer, context } = createRenderer();
    const tile = makeImage('thinPlateSpline').mesh[0];

    (renderer as any).drawWarpedTile({} as CanvasImageSource, tile, 0, 0, 400, 300);

    const triangles = tile.indices.length / 3;
    expect(context.clip).toHaveBeenCalledTimes(triangles);
    expect(context.drawImage).toHaveBeenCalledTimes(triangles);
    expect(context.save).toHaveBeenCalledTimes(triangles);
    expect(context.restore).toHaveBeenCalledTimes(triangles);
  });

  test('fallback and incoming map levels share one opacity composite, flushed before the next layer', () => {
    const { renderer, context } = createRenderer();
    const scratch = createRenderer().context;
    const canvas = { width: 256, height: 256, getContext: () => scratch };
    (renderer as any).warpCompositeCanvas = canvas;
    const group = {} as WarpedMapResource;
    for (let i = 0; i < 2; i++) {
      const image = makeImage('affine');
      (image as any).compositeOpacity = true;
      image.__parent = group;
      image.style.opacity = 0.4;
      renderer.prepareLayer(image, image.points);
      (renderer as any).drawWarpedTile({}, image.mesh[0], 0, 0, 200, 100);
      renderer.finishLayer();
    }
    expect(scratch.clearRect).toHaveBeenCalledTimes(1);
    expect(scratch.drawImage).toHaveBeenCalledTimes(2);
    expect(context.drawImage).not.toHaveBeenCalled();
    const next = makeImage('affine');
    let alpha = 0;
    context.drawImage.mockImplementation(() => {
      alpha = context.globalAlpha;
    });
    renderer.prepareLayer(next, next.points);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(canvas, 0, 0);
    expect(alpha).toBe(0.4);
    renderer.finishLayer();
    renderer.afterFrame(new World());
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  });

  test('tile readiness accounts for cache eviction and deferred reveal', () => {
    const { renderer } = createRenderer();
    const image = makeImage('affine');
    renderer.createImageHost(image);
    const buffer = image.__host.canvas;
    buffer.canvases[0] = 'test-tile';
    expect(buffer.isTileLoaded(0)).toBe(false);
    renderer.hostCache.set('test-tile', {} as any);
    buffer.tiles[0] = { state: 'decoded', loadedAt: undefined };
    (renderer as any).imageLoadingConfig.revealDelayFrames = 1;
    expect(buffer.isTileLoaded(0)).toBe(false);
    buffer.tiles[0].loadedAt = performance.now();
    expect(buffer.isTileLoaded(0)).toBe(true);
    renderer.hostCache.delete('test-tile');
    expect(buffer.isTileLoaded(0)).toBe(false);
  });

  test.each([false, true])(
    'keeps the warped fallback until the queued tile draw commits (cancelled: %s)',
    async (cancelled) => {
      const { renderer } = createRenderer();
      const fine = makeImage('affine', undefined, { id: 'fine' });
      const coarse = makeImage('affine', undefined, { id: 'coarse', scaleFactor: 4 });
      const composite = new CompositeResource({
        id: 'warped',
        width: 2400,
        height: 1600,
        images: [fine, coarse],
        renderOptions: { minSize: 0, minScaleGap: 0, renderLayers: 1, renderSmallestFallback: false, fadeInMs: 0 },
      });
      composite._sortByScales();
      coarse.__host = { canvas: { isTileLoaded: () => true } };
      renderer.createImageHost(fine);
      const buffer = fine.__host.canvas;
      const target = DnaFactory.singleBox(2400, 1600);
      const selected = () => composite.getAllPointsAt(target, undefined, 100).map(([image]) => image);
      renderer.visible = [fine];
      Object.assign((renderer as any).imageLoadingConfig, { revealDelayFrames: 0, revealBatchWindowFrames: 0 });
      vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
        release: vi.fn(),
        promise: Promise.resolve({ naturalWidth: 1000, naturalHeight: 700 }),
      });
      const prototype = HTMLCanvasElement.prototype as any;
      const original = prototype.getContext;
      const drawImage = vi.fn();
      prototype.getContext = () => ({ drawImage });
      try {
        renderer.schedulePaintToCanvas(buffer, fine, 0, 1);
        await renderer.loadingQueue.shift()!.task();
        const decode = renderer.loadingQueue.shift()!.task();
        // The next frame selects its layers before afterFrame runs this queued draw.
        expect(selected()).toEqual([coarse, fine]);
        expect(buffer.isTileLoaded(0)).toBe(false);
        expect(renderer.hostCache.has(buffer.canvases[0])).toBe(false);
        if (cancelled) buffer.tiles[0].state = 'idle';
        renderer.drawCalls.shift()!();
        await decode;
        expect(drawImage).toHaveBeenCalledTimes(cancelled ? 0 : 1);
        expect(buffer.isTileLoaded(0)).toBe(!cancelled);
        expect(renderer.hostCache.has(buffer.canvases[0])).toBe(!cancelled);
        expect(selected()).toEqual(cancelled ? [coarse, fine] : [fine]);
      } finally {
        prototype.getContext = original;
        renderer.reset();
      }
    }
  );

  test.each(['affine', 'thinPlateSpline'] as const)('clips a concave mask in texture space for %s', (type) => {
    const { renderer, context } = createRenderer();
    const tile = makeImage(type, undefined, {
      resourceMask: [
        [0, 0],
        [1000, 0],
        [500, 350],
        [1000, 700],
        [0, 700],
      ],
    }).mesh[0];
    (renderer as any).drawWarpedTile({} as CanvasImageSource, tile, 10, 20, 400, 300);
    const draws = tile.affine ? 1 : tile.indices.length / 3;
    expect(context.clip.mock.calls.filter((args: unknown[]) => args[0] === 'evenodd')).toHaveLength(draws);
    expect(context.drawImage).toHaveBeenCalledTimes(draws);
    // Each source-space mask must be applied after the texture-to-screen transform, before drawing.
    const maskClips = context.clip.mock.invocationCallOrder.filter(
      (_: number, i: number) => context.clip.mock.calls[i][0] === 'evenodd'
    );
    for (let i = 0; i < draws; i++) {
      expect(context.transform.mock.invocationCallOrder[i]).toBeLessThan(maskClips[i]);
      expect(maskClips[i]).toBeLessThan(context.drawImage.mock.invocationCallOrder[i]);
    }
    expect(context.lineTo).toHaveBeenCalledWith(500, 350);
    expect(context.save).toHaveBeenCalledTimes(draws);
    expect(context.restore).toHaveBeenCalledTimes(draws);
  });

  test('an affine tile maps the image corners onto the mapped corners', () => {
    const { renderer, context } = createRenderer();
    // Three points define an affine map exactly.
    const exact = controlPoints.slice(0, 3);
    const transformer = createWarpTransformer(exact, 'affine');
    const image = new WarpedImage({
      id: 'exact',
      tiles: [{ x1: 0, y1: 0, x2: 1000, y2: 700, url: 'x' }],
      imageWidth: 1000,
      imageHeight: 700,
      transformer,
      lngLatToWorld: projection.lngLatToWorld,
      transformationType: 'affine',
    });
    const tile = image.mesh[0];
    const width = tile.bounds.x2 - tile.bounds.x1;
    const height = tile.bounds.y2 - tile.bounds.y1;
    // Paint the tile at 2 screen px per map unit, at screen (50, 60).
    (renderer as any).drawWarpedTile({} as CanvasImageSource, tile, 50, 60, width * 2, height * 2);

    const [a, b, c, d, e, f] = context.transform.mock.calls[0];
    const px = (u: number, v: number) => [a * u + c * v + e, b * u + d * v + f];
    const expected = (u: number, v: number) => {
      const [lng, lat] = transformer.toGeo(u, v);
      const world = projection.lngLatToWorld(lng, lat);
      return [50 + (world.x - tile.bounds.x1) * 2, 60 + (world.y - tile.bounds.y1) * 2];
    };

    for (const [u, v] of [
      [0, 0],
      [1000, 0],
      [1000, 700],
      [0, 700],
      [400, 250],
    ]) {
      const [x, y] = px(u, v);
      const [ex, ey] = expected(u, v);
      expect(x).toBeCloseTo(ex, 2);
      expect(y).toBeCloseTo(ey, 2);
    }
  });
});

describe('WarpAdapterController', () => {
  test('builds a transformer from its state and notifies subscribers', () => {
    const controller = createWarpAdapterController();
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.getTransformer()).toBeNull();
    expect(controller.getError()).toBeInstanceOf(Error);

    controller.setControlPoints(controlPoints);
    controller.setTransformationType('affine');
    expect(listener).toHaveBeenCalledTimes(2);

    const transformer = controller.getTransformer();
    expect(transformer?.type).toBe('affine');
    // Cached until something changes.
    expect(controller.getTransformer()).toBe(transformer);

    controller.setTransformationType('projective');
    expect(controller.getTransformer()?.type).toBe('projective');
    expect(controller.getError()).toBeNull();
  });

  test('still forwards to an external adapter', () => {
    const adapter = { setMapGcps: vi.fn(), setMapTransformationType: vi.fn(), update: vi.fn() };
    const controller = createWarpAdapterController(adapter);
    controller.setControlPoints(controlPoints);
    controller.setTransformationType('thinPlateSpline');
    expect(adapter.setMapGcps).toHaveBeenCalledWith(controlPoints);
    expect(adapter.setMapTransformationType).toHaveBeenCalledWith('thinPlateSpline');
    expect(adapter.update).toHaveBeenCalledTimes(2);
  });
});

class MockRenderer implements Renderer {
  beforeFrame(): void {}
  paint(): void {}
  afterFrame(): void {}
  getScale(): number {
    return 1;
  }
  prepareLayer(): void {}
  finishLayer(): void {}
  afterPaintLayer(): void {}
  pendingUpdate(): boolean {
    return false;
  }
  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }
  getViewportBounds() {
    return null;
  }
  isReady(): boolean {
    return true;
  }
  resize(): void {}
  reset(): void {}
  getRendererScreenPosition() {
    return { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 800 };
  }
}

async function flushRender() {
  await Promise.resolve();
  await Promise.resolve();
  // Passive effects (onError) flush a little after the commit.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function collectWarped(runtime: Runtime): WarpedImage[] {
  const found: WarpedImage[] = [];
  const visit = (layers: any[]) => {
    for (const layer of layers) {
      if (layer instanceof WarpedImage) found.push(layer);
      if (layer && Array.isArray(layer.layers)) visit(layer.layers);
      if (layer && Array.isArray(layer.allImages)) visit(layer.allImages);
    }
  };
  for (const object of runtime.world.getObjects()) {
    if (object) visit(object.layers);
  }
  return found;
}

describe('MapWarpedImage', () => {
  function setup() {
    const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      scale: 1,
    });
    runtime.stop();
    const render = (element: React.ReactElement) =>
      ReactAtlas.render(
        React.createElement(
          'world',
          null,
          React.createElement(MapObject, { id: 'm', width: 2400, height: 1600, bounds: BOUNDS }, element)
        ),
        runtime
      );
    return { runtime, render };
  }

  test('builds large IIIF levels without reading the unallocated viewport grid and refreshes URLs', async () => {
    const { runtime, render } = setup();
    const service = {
      id: 'https://iiif.example.org/map',
      width: 10001,
      height: 8003,
      tiles: [{ width: 256, height: 128, scaleFactors: [2] }],
    };
    const element = (version3 = false, format = 'jpg') =>
      React.createElement(MapWarpedImage, {
        service: { ...service, version3, format },
        transformer: {
          type: 'affine',
          toGeo: (x: number, y: number): [number, number] => [-74.1 + x / 100000, 40.8 - y / 100000],
        },
      });
    render(element());
    await flushRender();
    const image = collectWarped(runtime)[0];
    expect(image.sourceTiles).toHaveLength(20 * 32);
    expect(image.sourceTiles[image.sourceTiles.length - 1]).toEqual({
      x1: 9728,
      y1: 7936,
      x2: 10001,
      y2: 8003,
      pixelWidth: 137,
      pixelHeight: 34,
      url: 'https://iiif.example.org/map/9728,7936,273,67/137,/0/default.jpg',
    });
    expect(image.mesh.every((tile) => tile.indices.length > 0)).toBe(true);
    render(element(true, 'png'));
    await flushRender();
    const updated = collectWarped(runtime)[0];
    expect(updated).not.toBe(image);
    expect(updated.getImageUrl(639)).toBe('https://iiif.example.org/map/9728,7936,273,67/137,34/0/default.png');
    runtime.dispose();
  });

  test('reports invalid and unbounded service inputs through onError', async () => {
    const { runtime, render } = setup();
    const onError = vi.fn();
    for (const width of [Infinity, 1000000]) {
      render(
        React.createElement(MapWarpedImage, {
          controlPoints,
          onError,
          service: { id: '/iiif', width, height: 1000000, tiles: [{ width: 256, scaleFactors: [1] }] },
        })
      );
      await flushRender();
      expect(collectWarped(runtime)).toHaveLength(0);
    }
    expect(onError).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  test('warps a single image', async () => {
    const { runtime, render } = setup();
    render(
      React.createElement(MapWarpedImage, {
        uri: 'https://example.org/map.jpg',
        width: 1000,
        height: 700,
        controlPoints,
        transformationType: 'projective',
        opacity: 0.8,
      })
    );
    await flushRender();

    const warped = collectWarped(runtime);
    expect(warped).toHaveLength(1);
    expect(warped[0].getImageUrl(0)).toBe('https://example.org/map.jpg');
    expect(warped[0].style.opacity).toBe(0.8);
    expect(warped[0].mesh[0].indices.length).toBeGreaterThan(6);
  });

  test('updates and removes a mask without replacing the tiled image', async () => {
    const { runtime, render } = setup();
    const element = (resourceMask?: [number, number][]) =>
      React.createElement(MapWarpedImage, {
        uri: 'https://example.org/map.jpg',
        width: 1000,
        height: 700,
        controlPoints,
        transformationType: 'affine',
        resourceMask,
      });
    render(
      element([
        [0, 0],
        [500, 0],
        [500, 700],
        [0, 700],
      ])
    );
    await flushRender();
    const [image] = collectWarped(runtime);
    expect(image.mesh[0].resourceMask).toBeDefined();
    const url = image.getImageUrl(0);
    render(
      element([
        [500, 0],
        [1000, 0],
        [1000, 700],
        [500, 700],
      ])
    );
    await flushRender();
    expect(collectWarped(runtime)[0]).toBe(image);
    expect(image.mesh[0].resourceMask![0]).toBe(500);
    expect(image.getImageUrl(0)).toBe(url);
    render(element());
    await flushRender();
    expect(collectWarped(runtime)[0]).toBe(image);
    expect(image.mesh[0].resourceMask).toBeUndefined();
  });

  test('reports invalid masks through onError', async () => {
    const { runtime, render } = setup();
    const onError = vi.fn();
    render(
      React.createElement(MapWarpedImage, {
        uri: 'https://example.org/map.jpg',
        width: 1000,
        height: 700,
        controlPoints,
        resourceMask: [
          [0, 0],
          [1, 1],
        ],
        onError,
      })
    );
    await flushRender();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/mask/i) }));
    expect(collectWarped(runtime)).toHaveLength(0);
  });

  test('re-fits in place when control points change', async () => {
    const { runtime, render } = setup();
    const element = (points: WarpControlPoint[]) =>
      React.createElement(MapWarpedImage, {
        uri: 'https://example.org/map.jpg',
        width: 1000,
        height: 700,
        controlPoints: points,
        transformationType: 'affine',
      });

    render(element(controlPoints));
    await flushRender();
    const [image] = collectWarped(runtime);
    const before = image.points[1];

    render(element(controlPoints.map((point) => ({ ...point, map: { ...point.map, lng: point.map.lng + 0.1 } }))));
    await flushRender();

    const [after] = collectWarped(runtime);
    expect(after).toBe(image);
    expect(image.points[1]).toBeGreaterThan(before);
  });

  test('builds one level per IIIF scale factor', async () => {
    const { runtime, render } = setup();
    render(
      React.createElement(MapWarpedImage, {
        service: {
          id: 'https://iiif.example.org/map',
          width: 4000,
          height: 3000,
          tiles: [{ width: 512, scaleFactors: [1, 2, 4] }],
        },
        controlPoints: [
          { image: { x: 0, y: 0 }, map: { lng: -74.08, lat: 40.9 } },
          { image: { x: 4000, y: 0 }, map: { lng: -73.85, lat: 40.88 } },
          { image: { x: 4000, y: 3000 }, map: { lng: -73.86, lat: 40.7 } },
        ],
        transformationType: 'affine',
      })
    );
    await flushRender();

    const warped = collectWarped(runtime);
    expect(warped).toHaveLength(3);
    const full = warped.find((image) => image.levelScale === 1)!;
    expect(full.sourceTiles).toHaveLength(8 * 6);
    expect(full.getImageUrl(0)).toMatch(/^https:\/\/iiif\.example\.org\/map\/0,0,512,512\//);
    const coarse = warped.find((image) => image.levelScale === 4)!;
    expect(coarse.sourceTiles).toHaveLength(2 * 2);
    const composite = full.__parent!;
    composite.applyProps({ minSize: 0, renderLayers: 1, renderSmallestFallback: false });
    composite._sortByScales();
    coarse.__host = { canvas: { isTileLoaded: () => true } };
    const target = DnaFactory.singleBox(2400, 1600);
    const selected = () => composite.getAllPointsAt(target, undefined, 100).map(([image]) => image);
    expect(selected()).toEqual([coarse, warped.find((image) => image.levelScale === 2), full]);
    full.__host = { canvas: { isTileLoaded: () => true } };
    expect(selected()).toEqual([full]);
    expect(warped.every((image) => image.compositeOpacity)).toBe(true);
  });

  test('reports control points that can not be solved instead of throwing', async () => {
    const { runtime, render } = setup();
    const onError = vi.fn();
    render(
      React.createElement(MapWarpedImage, {
        uri: 'https://example.org/map.jpg',
        width: 1000,
        height: 700,
        controlPoints: controlPoints.slice(0, 2),
        transformationType: 'affine',
        onError,
      })
    );
    await flushRender();

    expect(collectWarped(runtime)).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/at least 3/);
  });
});

describe('WarpedMapLayer over ordinary IIIF tiles', () => {
  test('keeps the IIIF image unchanged and updates the overlay without map context', async () => {
    const runtime = new Runtime(new MockRenderer(), new World(1000, 700), {
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      scale: 1,
    });
    runtime.stop();
    const transformer = createWarpTransformer(controlPoints, 'thinPlateSpline');
    const controller = createWarpAdapterController();
    controller.setControlPoints(controlPoints);
    controller.setTransformationType('thinPlateSpline');
    const tiles = {
      id: 'https://example.org/iiif',
      width: 1000,
      height: 700,
      imageService: {
        id: 'https://example.org/iiif',
        type: 'ImageService3',
        profile: 'level2',
        width: 1000,
        height: 700,
        tiles: [{ width: 256, scaleFactors: [1, 2, 4] }],
      },
    } as any;
    const render = (options: Record<string, unknown> = {}) =>
      ReactAtlas.render(
        <world>
          <world-object id="sheet" width={1000} height={700} x={150} y={75} scale={0.5}>
            <TileSet tiles={tiles} width={1000} height={700} />
            <WarpedMapLayer imageWidth={1000} imageHeight={700} transformer={transformer} {...options} />
          </world-object>
        </world>,
        runtime
      );
    const frame = async () => {
      const target = DnaFactory.singleBox(1000, 700);
      runtime.world.getPointsAt(target, undefined, 1);
      for (const update of runtime.world.getScheduledUpdates(target, 1)) await update();
      return runtime.world.getObjects().find(Boolean)!;
    };
    const resourceMask = [
      [100, 100],
      [900, 100],
      [500, 600],
    ];
    render({ resourceMask, opacity: 0.4 });
    await flushRender();
    const object = await frame();
    expect(object.points[0]).toBe(1);
    const imageObject = object.layers[0] as unknown as WorldObject;
    const iiif = (imageObject.layers[0] as any).allImages;
    const before = iiif.map((image: any) => ({ image, points: Array.from(image.points), url: image.getImageUrl(0) }));
    const overlay = object.layers[1] as WarpedMapResource;
    expect(overlay).toBeInstanceOf(WarpedMapResource);
    expect(overlay.images).toHaveLength(1);
    expect((overlay.images[0] as any).getWarpTile(0).destinationMask).toHaveLength(6);
    expect(overlay.images[0].__owner.value).toBe(object);

    // Omitting props removes the previous mask and restores opacity.
    render();
    await flushRender();
    await frame();
    expect((overlay.images[0] as any).getWarpTile(0).destinationMask).toHaveLength(8);
    expect((overlay.images[0] as any).style.opacity).toBe(1);
    for (const { image, points, url } of before) {
      expect(iiif).toContain(image);
      expect(Array.from(image.points)).toEqual(points);
      expect(image.getImageUrl(0)).toBe(url);
    }

    // A shared controller can change the registration after mounting.
    render({ transformer: undefined, controller });
    await flushRender();
    await frame();
    const oldOverlay = overlay.images[0];
    controller.setControlPoints(controlPoints.map((p) => ({ ...p, map: { lng: p.map.lng + 0.1, lat: p.map.lat } })));
    await flushRender();
    await frame();
    expect(overlay.images[0]).not.toBe(oldOverlay);
    runtime.dispose();
  });

  test('invalid control points call onError without mounting a broken layer', async () => {
    const runtime = new Runtime(new MockRenderer(), new World(1000, 700), {
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      scale: 1,
    });
    runtime.stop();
    const onError = vi.fn();
    ReactAtlas.render(
      <world>
        <world-object width={1000} height={700}>
          <WarpedMapLayer imageWidth={1000} imageHeight={700} controlPoints={[]} onError={onError} />
        </world-object>
      </world>,
      runtime
    );
    await flushRender();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(runtime.world.getObjects().find(Boolean)!.layers).toHaveLength(0);
    runtime.dispose();
  });
});

test('refitting a warp updates the quality scale used to select pyramid levels', () => {
  const image = makeImage('affine');
  const scale = image.display.scale;
  image.setTransform({
    transformer: createWarpTransformer(controlPoints, 'affine'),
    lngLatToWorld: (lng, lat) => {
      const point = projection.lngLatToWorld(lng, lat);
      return { x: point.x * 2, y: point.y * 2 };
    },
  });
  expect(image.display.scale).toBeCloseTo(scale * 2, 6);
});
