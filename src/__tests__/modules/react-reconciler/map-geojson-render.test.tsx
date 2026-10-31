/** @vitest-environment happy-dom */

import type { Strand } from '@atlas-viewer/dna';
import React from 'react';
import { createMapProjection } from '../../../modules/maps/projection';
import type { MapGeoJSONInput } from '../../../modules/maps/types';
import { AtlasContext } from '../../../modules/react-reconciler/components/AtlasContext';
import { MapGeoJSON } from '../../../modules/react-reconciler/components/MapGeoJSON';
import { MapObject } from '../../../modules/react-reconciler/components/MapObject';
import { projectMapGeoJSON } from '../../../modules/react-reconciler/hooks/use-map-geojson';
import { ReactAtlas } from '../../../modules/react-reconciler/reconciler';
import { Box } from '../../../objects/box';
import { Geometry } from '../../../objects/geometry';
import type { Renderer } from '../../../renderer/renderer';
import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import type { Paint } from '../../../world-objects/paint';

class MockRenderer implements Renderer {
  beforeFrame(): void {}
  paint(): void {}
  afterFrame(): void {}
  static scale = 1;
  getScale(): number {
    return MockRenderer.scale;
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

const BOUNDS = { west: -74.3, south: 40.45, east: -73.6, north: 40.95 };

const projection = createMapProjection({
  bounds: BOUNDS,
  width: 2400,
  height: 1600,
});

function polygonWithHole(): MapGeoJSONInput {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [-74.2, 40.55],
        [-73.7, 40.55],
        [-73.7, 40.85],
        [-74.2, 40.85],
        [-74.2, 40.55],
      ],
      [
        [-74.0, 40.65],
        [-73.9, 40.65],
        [-73.9, 40.75],
        [-74.0, 40.75],
        [-74.0, 40.65],
      ],
    ],
  };
}

describe('GeoJSON projection', () => {
  test('polygon holes stay with their polygon instead of becoming filled shapes', () => {
    const items = projectMapGeoJSON(polygonWithHole(), projection);
    expect(items).toHaveLength(1);
    const shape = items[0];
    if (shape.kind !== 'shape') throw new Error('expected shape');
    expect(shape.open).toBe(false);
    expect(shape.holes).toHaveLength(1);
    expect(shape.holes?.[0]).toHaveLength(5);
  });

  test('multipolygons produce one shape per polygon, each with its holes', () => {
    const items = projectMapGeoJSON(
      {
        type: 'MultiPolygon',
        coordinates: [
          (polygonWithHole() as any).coordinates,
          [
            [
              [-74.28, 40.46],
              [-74.25, 40.46],
              [-74.25, 40.5],
              [-74.28, 40.46],
            ],
          ],
        ],
      },
      projection
    );
    expect(items).toHaveLength(2);
    expect((items[0] as any).holes).toHaveLength(1);
    expect((items[1] as any).holes).toBeUndefined();
  });

  test('geometry collections are flattened', () => {
    const items = projectMapGeoJSON(
      {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [-74, 40.7] },
          {
            type: 'LineString',
            coordinates: [
              [-74.2, 40.6],
              [-73.8, 40.8],
            ],
          },
        ],
      },
      projection
    );
    expect(items.map((item) => item.kind)).toEqual(['point', 'shape']);
    expect(new Set(items.map((item) => item.key)).size).toBe(2);
  });

  test('duplicate feature ids still produce unique keys', () => {
    const point = {
      type: 'Feature' as const,
      id: 7,
      properties: null,
      geometry: { type: 'Point' as const, coordinates: [-74, 40.7] as [number, number] },
    };
    const items = projectMapGeoJSON(
      { type: 'FeatureCollection', features: [point, point, { ...point, id: 0 }] },
      projection
    );
    expect(new Set(items.map((item) => item.key)).size).toBe(3);
    expect(items.map((item) => item.key)).toContain('feature-0-point');
  });
});

describe('Geometry holes', () => {
  test('hit testing ignores points inside a hole', () => {
    const geometry = new Geometry();
    geometry.applyProps({
      id: 'g',
      target: { x: 0, y: 0, width: 100, height: 100 },
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      holes: [
        [
          [40, 40],
          [60, 40],
          [60, 60],
          [40, 60],
        ],
      ],
    });

    expect(geometry.intersects([10, 10])).toBe(true);
    expect(geometry.intersects([50, 50])).toBe(false);
    expect(geometry.intersects([150, 50])).toBe(false);
  });

  test('holes can be added and removed', () => {
    const geometry = new Geometry();
    const base = {
      id: 'g',
      target: { x: 0, y: 0, width: 100, height: 100 },
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ] as [number, number][],
    };
    geometry.applyProps(base);
    expect((geometry.shape as any).holes).toBeUndefined();
    const revision = geometry.__revision;

    geometry.applyProps({
      ...base,
      holes: [
        [
          [40, 40],
          [60, 40],
          [60, 60],
        ],
      ],
    });
    expect((geometry.shape as any).holes).toHaveLength(1);
    expect(geometry.__revision).toBeGreaterThan(revision);

    geometry.applyProps({ ...base, holes: [] });
    expect((geometry.shape as any).holes).toBeUndefined();
  });
});

async function flushRender() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function collect(runtime: Runtime) {
  const found: any[] = [];
  const visit = (layers: any[]) => {
    for (const layer of layers) {
      found.push(layer);
      if (layer && Array.isArray(layer.layers)) visit(layer.layers);
    }
  };
  for (const object of runtime.world.getObjects()) {
    if (object) visit(object.layers);
  }
  return found;
}

describe('MapGeoJSON rendering', () => {
  function render(element: React.ReactElement) {
    const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      scale: 1,
    });
    runtime.stop();
    ReactAtlas.render(
      React.createElement(
        'world',
        null,
        React.createElement(MapObject, { id: 'm', width: 2400, height: 1600, bounds: BOUNDS }, element)
      ),
      runtime
    );
    return runtime;
  }

  const features: MapGeoJSONInput = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'park',
        properties: { kind: 'park' },
        geometry: polygonWithHole().type === 'Polygon' ? (polygonWithHole() as any) : null,
      },
      {
        type: 'Feature',
        id: 'stop',
        properties: { kind: 'stop' },
        geometry: { type: 'Point', coordinates: [-74, 40.7] },
      },
    ],
  };

  test('passes holes through to the shape and applies per feature styles', async () => {
    const runtime = render(
      React.createElement(MapGeoJSON, {
        data: features,
        polygonStyle: (feature: any) => ({
          backgroundColor: feature?.properties?.kind === 'park' ? 'green' : 'grey',
        }),
        markerStyle: (feature: any) => ({
          backgroundColor: feature?.properties?.kind === 'stop' ? 'orange' : 'red',
        }),
      })
    );
    await flushRender();

    const layers = collect(runtime);
    const shape = layers.find((layer) => layer instanceof Geometry) as Geometry;
    const box = layers.find((layer) => layer instanceof Box) as Box;

    expect(shape).toBeDefined();
    expect((shape.shape as any).holes).toHaveLength(1);
    expect(shape.props.style?.backgroundColor).toBe('green');
    expect(box.props.style?.backgroundColor).toBe('orange');
  });

  test('feature handlers receive the feature and make shapes interactive', async () => {
    const onFeatureClick = vi.fn();
    const runtime = render(React.createElement(MapGeoJSON, { data: features, onFeatureClick }));
    await flushRender();

    const layers = collect(runtime);
    const shape = layers.find((layer) => layer instanceof Geometry) as Geometry;
    expect(shape.props.interactive).toBe(true);

    shape.dispatchEvent('onClick', { type: 'click' });
    expect(onFeatureClick).toHaveBeenCalledTimes(1);
    expect(onFeatureClick.mock.calls[0][0].id).toBe('park');
  });

  test('screen sized markers divide by the viewport scale', async () => {
    MockRenderer.scale = 4;
    try {
      const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        scale: 1,
      });
      runtime.stop();
      ReactAtlas.render(
        React.createElement(
          'world',
          null,
          React.createElement(
            AtlasContext.Provider,
            { value: { runtime } as any },
            React.createElement(
              MapObject,
              { id: 'm', width: 2400, height: 1600, bounds: BOUNDS },
              React.createElement(MapGeoJSON, {
                data: { type: 'Point', coordinates: [-74, 40.7] },
                markerSize: 10,
                markerSizeUnit: 'screen',
              })
            )
          )
        ),
        runtime
      );
      await flushRender();

      const box = collect(runtime).find((layer) => layer instanceof Box) as Box;
      expect(box).toBeDefined();
      // 10 screen px at 4 screen px per world unit.
      expect(box.points[3] - box.points[1]).toBeCloseTo(2.5, 5);
    } finally {
      MockRenderer.scale = 1;
    }
  });
});

test('screen-sized markers include ancestor scales and follow ancestor updates', async () => {
  MockRenderer.scale = 4;
  const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
    x: 0,
    y: 0,
    width: 1000,
    height: 800,
    scale: 1,
  });
  runtime.stop();
  try {
    const render = (scale: number) =>
      ReactAtlas.render(
        <world>
          <AtlasContext.Provider value={{ runtime } as any}>
            <world-object width={1000} height={800} scale={scale}>
              <MapObject width={2400} height={1600} bounds={BOUNDS} scale={2}>
                <MapGeoJSON
                  data={{ type: 'Point', coordinates: [-74, 40.7] }}
                  markerSize={12}
                  markerSizeUnit="screen"
                />
              </MapObject>
            </world-object>
          </AtlasContext.Provider>
        </world>,
        runtime
      );
    const width = () => {
      const box = collect(runtime).find((layer) => layer instanceof Box) as Box;
      return box.points[3] - box.points[1];
    };
    render(3);
    await flushRender();
    runtime.hook('useAfterFrame', 0);
    await flushRender();
    expect(width()).toBeCloseTo(12 / (4 * 3 * 2), 3);
    render(6);
    await flushRender();
    runtime.hook('useAfterFrame', 0);
    await flushRender();
    expect(width()).toBeCloseTo(12 / (4 * 6 * 2), 3);
  } finally {
    runtime.dispose();
    MockRenderer.scale = 1;
  }
});
