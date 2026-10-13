/** @vitest-environment happy-dom */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Strand } from '@atlas-viewer/dna';
import React from 'react';
import { ReactAtlas } from '../../../modules/react-reconciler/reconciler';
import type { Renderer } from '../../../renderer/renderer';
import { Runtime } from '../../../renderer/runtime';
import { CompositeResource } from '../../../spacial-content/composite-resource';
import { MapObject } from '../../../modules/react-reconciler/components/MapObject';
import { MapTileLayer } from '../../../modules/react-reconciler/components/MapTileLayer';
import { useMapProjectionContext } from '../../../modules/react-reconciler/hooks/use-map-projection';
import { MapTilePyramid } from '../../../spacial-content/map-tile-pyramid';
import { MapTiledImage } from '../../../spacial-content/map-tiled-image';
import type { PositionPair } from '../../../types';
import { World } from '../../../world';
import type { Paint } from '../../../world-objects/paint';

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
  getViewportBounds(): PositionPair | null {
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

function createRuntime() {
  const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
    x: 0,
    y: 0,
    width: 1000,
    height: 800,
    scale: 1,
  });
  runtime.stop();
  return runtime;
}

const NYC = { west: -74.3, south: 40.45, east: -73.6, north: 40.95 };

function findPyramid(runtime: Runtime): MapTilePyramid {
  // The pyramid is nested in a frame object when the map is letterboxed.
  const visit = (layers: any[]): MapTilePyramid | undefined => {
    for (const layer of layers) {
      if (layer instanceof MapTilePyramid) {
        return layer;
      }
      if (layer && Array.isArray(layer.layers)) {
        const found = visit(layer.layers);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const object of runtime.world.getObjects()) {
    const found = object ? visit(object.layers) : undefined;
    if (found) return found;
  }
  throw new Error('No MapTilePyramid in the world');
}

async function flushRender() {
  await Promise.resolve();
  await Promise.resolve();
  // Passive effects (onError) flush a little after the commit.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('map components', () => {
  test('MapObject owns map context and world-object wrapper', async () => {
    const runtime = createRuntime();
    let context: ReturnType<typeof useMapProjectionContext> | undefined;
    const Probe = () => {
      context = useMapProjectionContext();
      return null;
    };

    ReactAtlas.render(
      React.createElement(
        'world',
        null,
        React.createElement(
          MapObject,
          { id: 'city', x: 100, y: 50, width: 2400, height: 1600, bounds: NYC },
          React.createElement(Probe)
        )
      ),
      runtime
    );
    await flushRender();

    const [object] = runtime.world.getObjects().filter((object) => object !== null);
    expect(object.points[1]).toBe(100);
    expect(object.points[3] - object.points[1]).toBe(2400);

    // The map is letterboxed inside the object and projections include the offset.
    expect(context).toBeDefined();
    const { mapRect, projection } = context!;
    expect(mapRect.width <= 2400 && mapRect.height <= 1600).toBe(true);
    expect(mapRect.x > 0 || mapRect.y > 0).toBe(true);
    const northWest = projection.lngLatToWorld(NYC.west, NYC.north);
    expect(northWest.x).toBeCloseTo(mapRect.x, 6);
    expect(northWest.y).toBeCloseTo(mapRect.y, 6);
    const southEast = projection.lngLatToWorld(NYC.east, NYC.south);
    expect(southEast.x).toBeCloseTo(mapRect.x + mapRect.width, 6);
    expect(southEast.y).toBeCloseTo(mapRect.y + mapRect.height, 6);
  });

  test('MapTileLayer defaults to OSM and builds a tile pyramid', async () => {
    const runtime = createRuntime();

    ReactAtlas.render(
      React.createElement(
        'world',
        null,
        React.createElement(
          MapObject,
          { id: 'city', width: 2400, height: 1600, bounds: NYC },
          React.createElement(MapTileLayer, { minZoom: 8, maxZoom: 12 })
        )
      ),
      runtime
    );
    await flushRender();

    const pyramid = findPyramid(runtime);
    expect(pyramid).toBeInstanceOf(MapTilePyramid);
    expect(pyramid.zoomLevels).toEqual([8, 9, 10, 11, 12]);

    const image = pyramid.allImages[0] as MapTiledImage;
    expect(image.getImageUrl(0)).toContain('https://tile.openstreetmap.org/');
    // Map layers keep fractional scales apart and clip to the map bounds.
    expect(pyramid.renderOptions.minScaleGap).toBe(0);
    expect(pyramid.renderOptions.clipToBounds).toBe(true);
    expect(pyramid.renderOptions.useDevicePixelRatio).toBe(false);
  });

  test('changing bounds rebuilds the tile levels in place', async () => {
    const runtime = createRuntime();
    const render = (bounds: typeof NYC) =>
      ReactAtlas.render(
        React.createElement(
          'world',
          null,
          React.createElement(
            MapObject,
            { id: 'city', width: 2400, height: 1600, bounds },
            React.createElement(MapTileLayer, { minZoom: 8, maxZoom: 10 })
          )
        ),
        runtime
      );

    render(NYC);
    await flushRender();
    const pyramid = findPyramid(runtime);
    const before = pyramid.allImages[0] as MapTiledImage;
    const builds = pyramid.buildCount;

    // Same values, new object: nothing should be rebuilt.
    render({ ...NYC });
    await flushRender();
    expect(findPyramid(runtime)).toBe(pyramid);
    expect(pyramid.buildCount).toBe(builds);

    render({ west: -123.2, south: 37.4, east: -121.7, north: 38.2 });
    await flushRender();

    // Same instance (no remount), but tiles now cover San Francisco.
    expect(findPyramid(runtime)).toBe(pyramid);
    expect(pyramid.buildCount).toBe(builds + 1);
    const after = pyramid.allImages[0] as MapTiledImage;
    expect(after).not.toBe(before);
    expect(after.bounds.west).toBe(-123.2);
    // Fresh ids, so renderer tile state from the old layer can not be reused.
    expect(after.id).not.toBe(before.id);
  });

  test('an inline function tile source does not reload the layer on every render', async () => {
    const runtime = createRuntime();
    const render = (prefix: string, key?: string) =>
      ReactAtlas.render(
        React.createElement(
          'world',
          null,
          React.createElement(
            MapObject,
            { id: 'city', width: 2400, height: 1600, bounds: NYC },
            React.createElement(MapTileLayer, {
              minZoom: 9,
              maxZoom: 9,
              tileSource: ({ z, x, y }: any) => `${prefix}/${z}/${x}/${y}.png`,
              tileSourceKey: key,
            })
          )
        ),
        runtime
      );

    render('https://a.example', 'a');
    await flushRender();
    const pyramid = findPyramid(runtime);
    const builds = pyramid.buildCount;
    expect((pyramid.allImages[0] as MapTiledImage).getImageUrl(0)).toContain('https://a.example/9/');

    // A new function with the same key is the same source.
    render('https://a.example', 'a');
    await flushRender();
    expect(pyramid.buildCount).toBe(builds);

    render('https://b.example', 'b');
    await flushRender();
    expect(pyramid.buildCount).toBe(builds + 1);
    expect((pyramid.allImages[0] as MapTiledImage).getImageUrl(0)).toContain('https://b.example/9/');
  });

  test('MapObject renders nothing and reports invalid bounds instead of throwing', async () => {
    const runtime = createRuntime();
    const onError = vi.fn();

    ReactAtlas.render(
      React.createElement(
        'world',
        null,
        React.createElement(MapObject, {
          id: 'broken',
          width: 2400,
          height: 1600,
          bounds: { west: 10, south: 0, east: -10, north: 1 },
          onError,
        })
      ),
      runtime
    );
    await flushRender();

    expect(runtime.world.getObjects().filter(Boolean)).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('west < east');
  });

  test.each([
    { width: Infinity, height: 1600, bounds: NYC },
    { width: 2400, height: NaN, bounds: NYC },
    { width: 2400, height: 1600, bounds: { west: 10, east: 20, south: 86, north: 89 } },
  ])('MapObject reports invalid projection inputs and recovers: %j', async (props) => {
    const runtime = createRuntime();
    const onError = vi.fn();
    const render = (input: typeof props) =>
      ReactAtlas.render(
        React.createElement(
          'world',
          null,
          React.createElement(MapObject, { ...input, preserveAspectRatio: false, onError })
        ),
        runtime
      );
    render(props);
    await flushRender();
    expect(runtime.world.getObjects().filter(Boolean)).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);
    render({ width: 2400, height: 1600, bounds: NYC });
    await flushRender();
    expect(runtime.world.getObjects().filter(Boolean)).toHaveLength(1);
    runtime.dispose();
  });

  test('low-level map-tiled-image intrinsic renders through reconciler', async () => {
    const runtime = createRuntime();

    ReactAtlas.render(
      React.createElement(
        'world',
        null,
        React.createElement(
          'world-object',
          { id: 'map-layer', x: 0, y: 0, width: 2400, height: 1600 },
          React.createElement(
            'composite-image',
            { id: 'map-composite', width: 2400, height: 1600 },
            React.createElement('map-tiled-image', {
              id: 'map-z8',
              bounds: { west: -74.3, south: 40.45, east: -73.6, north: 40.95 },
              worldWidth: 2400,
              worldHeight: 1600,
              zoom: 8,
              scaleFactor: 2,
            }),
            React.createElement('map-tiled-image', {
              id: 'map-z9',
              bounds: { west: -74.3, south: 40.45, east: -73.6, north: 40.95 },
              worldWidth: 2400,
              worldHeight: 1600,
              zoom: 9,
              scaleFactor: 1,
            })
          )
        )
      ),
      runtime
    );

    await flushRender();

    const worldObjects = runtime.world.getObjects().filter(Boolean);
    expect(worldObjects).toHaveLength(1);
    const mapObject = worldObjects[0]!;

    expect(mapObject.layers).toHaveLength(1);
    const composite = mapObject.layers[0] as CompositeResource;
    expect(composite).toBeInstanceOf(CompositeResource);
    expect(composite.allImages).toHaveLength(2);
    for (const image of composite.allImages) {
      expect(image).toBeInstanceOf(MapTiledImage);
    }
  });
});
