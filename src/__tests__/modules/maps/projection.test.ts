import {
  MAX_MERCATOR_LATITUDE,
  clampMercatorLatitude,
  createMapProjection,
  validateMapBounds,
} from '../../../modules/maps/projection';
import type { MapBounds } from '../../../modules/maps/types';

const nycBounds: MapBounds = {
  west: -74.3,
  south: 40.45,
  east: -73.6,
  north: 40.95,
};

describe('map projection', () => {
  test('supports lng/lat to world and world to lng/lat round-trips', () => {
    const projection = createMapProjection({ bounds: nycBounds, width: 2400, height: 1600 });

    const world = projection.lngLatToWorld(-74.0, 40.7);
    const lngLat = projection.worldToLngLat(world.x, world.y);

    expect(lngLat.lng).toBeCloseTo(-74.0, 5);
    expect(lngLat.lat).toBeCloseTo(40.7, 5);
  });

  test('converts bounds to world rect and back', () => {
    const projection = createMapProjection({ bounds: nycBounds, width: 2400, height: 1600 });

    const rect = projection.lngLatBoundsToWorldRect({
      west: -74.15,
      south: 40.55,
      east: -73.85,
      north: 40.8,
    });

    const bounds = projection.worldRectToLngLatBounds(rect);

    expect(bounds.west).toBeCloseTo(-74.15, 5);
    expect(bounds.south).toBeCloseTo(40.55, 5);
    expect(bounds.east).toBeCloseTo(-73.85, 5);
    expect(bounds.north).toBeCloseTo(40.8, 5);
  });

  test('projects rings into world coordinate points', () => {
    const projection = createMapProjection({ bounds: nycBounds, width: 1000, height: 500 });
    const ring = projection.projectRing([
      [-74.2, 40.9],
      [-73.9, 40.9],
      [-73.9, 40.6],
      [-74.2, 40.6],
      [-74.2, 40.9],
    ]);

    expect(ring).toHaveLength(5);
    expect(ring[0][0]).toBeLessThan(ring[1][0]);
    expect(ring[0][1]).toBeLessThan(ring[2][1]);
  });

  test('clamps latitude for mercator math', () => {
    expect(clampMercatorLatitude(90)).toBeCloseTo(MAX_MERCATOR_LATITUDE, 8);
    expect(clampMercatorLatitude(-90)).toBeCloseTo(-MAX_MERCATOR_LATITUDE, 8);
    expect(clampMercatorLatitude(45)).toBe(45);
  });

  test('throws on invalid map bounds', () => {
    expect(() =>
      validateMapBounds({
        west: -73,
        east: -74,
        south: 40,
        north: 41,
      })
    ).toThrow(/west < east/);

    expect(() =>
      validateMapBounds({
        west: -74,
        east: -73,
        south: 41,
        north: 40,
      })
    ).toThrow(/south < north/);
  });
});
