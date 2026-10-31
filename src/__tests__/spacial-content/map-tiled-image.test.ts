import { tileXToLng, tileYToLat } from '../../modules/maps/projection';
import {
  createFiniteTileGrid,
  estimateFiniteTileGridCoverage,
  MapTiledImage,
} from '../../spacial-content/map-tiled-image';

describe('MapTiledImage', () => {
  test('generates finite tile grid for bounds at zoom level', () => {
    const grid = createFiniteTileGrid({
      bounds: {
        west: -74.3,
        south: 40.45,
        east: -73.6,
        north: 40.95,
      },
      zoom: 10,
      worldWidth: 2400,
      worldHeight: 1600,
    });

    expect(grid.columns).toBeGreaterThan(0);
    expect(grid.rows).toBeGreaterThan(0);
    expect(grid.tiles.length).toEqual(grid.columns * grid.rows);
    expect(grid.minTileX).toBeLessThanOrEqual(grid.maxTileX);
    expect(grid.minTileY).toBeLessThanOrEqual(grid.maxTileY);
  });

  test('maps tile index to OSM URL output', () => {
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
      scaleFactor: 1,
    });

    expect(image.tileCoordinates.length).toBeGreaterThan(0);

    const first = image.tileCoordinates[0];
    const url = image.getImageUrl(0);

    expect(url).toEqual(`https://tile.openstreetmap.org/${first.z}/${first.x}/${first.y}.png`);
  });

  test('supports custom function tile source', () => {
    const image = new MapTiledImage({
      bounds: {
        west: -74.3,
        south: 40.45,
        east: -73.6,
        north: 40.95,
      },
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 8,
      scaleFactor: 2,
      tileSource: ({ z, x, y }) => `https://tiles.example.org/${z}/${x}/${y}.jpg`,
    });

    expect(image.display.scale).toEqual(2);
    expect(image.getImageUrl(0)).toMatch(/^https:\/\/tiles\.example\.org\//);
  });

  test('supports safety maxTiles constraint for finite grids', () => {
    expect(() =>
      createFiniteTileGrid({
        bounds: {
          west: -74.3,
          south: 40.45,
          east: -73.6,
          north: 40.95,
        },
        zoom: 10,
        worldWidth: 2400,
        worldHeight: 1600,
        maxTiles: 1,
      })
    ).toThrow(/exceeds the configured max/);
  });

  test('inherits tiled image compatibility for renderer paths', () => {
    const image = new MapTiledImage({
      bounds: {
        west: -74.3,
        south: 40.45,
        east: -73.6,
        north: 40.95,
      },
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 9,
    });

    expect(image.type).toEqual('spacial-content');
    expect(image.columns).toBeGreaterThan(0);
    expect(image.rows).toBeGreaterThan(0);
  });

  test('reports fractional tile span for partial edge coverage', () => {
    const zoom = 6;
    const coverage = estimateFiniteTileGridCoverage({
      bounds: {
        west: tileXToLng(10.25, zoom),
        south: tileYToLat(20.9, zoom),
        east: tileXToLng(10.75, zoom),
        north: tileYToLat(20.1, zoom),
      },
      zoom,
    });

    expect(coverage.columns).toBe(1);
    expect(coverage.rows).toBe(1);
    expect(coverage.tileSpanX).toBeCloseTo(0.5, 5);
    expect(coverage.tileSpanY).toBeCloseTo(0.8, 5);
  });
});

describe('MapTiledImage canvas sizing and regions', () => {
  const bounds = { west: -74.3, south: 40.45, east: -73.6, north: 40.95 };

  test('display points are source pixels, so tile canvases are tile sized', () => {
    // The world is ~47x bigger than the tile pixels: a z10 tile is ~256px wide, not 12000.
    const image = new MapTiledImage({
      bounds,
      worldWidth: 24000,
      worldHeight: 16000,
      zoom: 10,
      scaleFactor: 47.08,
    });

    // Whole pixels: fractional canvas sizes truncate and leave a gap row between tiles.
    for (let i = 0; i < image.tileCoordinates.length; i++) {
      expect(image.display.points[i * 5 + 3] - image.display.points[i * 5 + 1]).toBe(256);
      expect(image.display.points[i * 5 + 4] - image.display.points[i * 5 + 2]).toBe(256);
    }

    // ...while the points used for culling and painting stay in world units.
    expect(image.points[3] - image.points[1]).toBeCloseTo(256 * 47.08, -1);
  });

  test('a region restricts the grid but keeps world positions', () => {
    const full = new MapTiledImage({ bounds, worldWidth: 2400, worldHeight: 1600, zoom: 12, scaleFactor: 1 });
    const region = { west: -74.0, south: 40.7, east: -73.95, north: 40.75 };
    const windowed = new MapTiledImage({
      bounds,
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 12,
      scaleFactor: 1,
      region,
    });

    expect(windowed.tileCoordinates.length).toBeLessThan(full.tileCoordinates.length);
    expect(windowed.tileCoordinates.length).toBeGreaterThan(0);

    // Every windowed tile exists in the full grid at the same world position.
    for (let i = 0; i < windowed.tileCoordinates.length; i++) {
      const tile = windowed.tileCoordinates[i];
      const fullIndex = full.tileCoordinates.findIndex((t) => t.x === tile.x && t.y === tile.y);
      expect(fullIndex).toBeGreaterThanOrEqual(0);
      for (let k = 1; k <= 4; k++) {
        expect(windowed.points[i * 5 + k]).toBeCloseTo(full.points[fullIndex * 5 + k], 6);
      }
    }
  });

  test('a region outside the bounds produces an empty, hidden grid', () => {
    const image = new MapTiledImage({
      bounds,
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 10,
      scaleFactor: 1,
      region: { west: 10, south: 10, east: 11, north: 11 },
    });
    expect(image.tileCoordinates).toHaveLength(0);
    expect(image.points[0]).toBe(0);
    expect(image.getImageUrl(0)).toBe('');
  });

  test('retina templates resolve {r}', () => {
    const image = new MapTiledImage({
      bounds,
      worldWidth: 2400,
      worldHeight: 1600,
      zoom: 10,
      tileUrlTemplate: 'https://tiles.example/{z}/{x}/{y}{r}.png',
      retina: true,
    });
    expect(image.getImageUrl(0)).toMatch(/\/10\/\d+\/\d+@2x\.png$/);
  });

  test('keeps png format when props are applied', () => {
    const image = new MapTiledImage({ bounds, worldWidth: 2400, worldHeight: 1600, zoom: 10 });
    image.applyProps({});
    expect(image.format).toBe('png');
  });
});

test('keeps subpixel map tile positions in large world frames', () => {
  const bounds = { west: -74.3, south: 40.45, east: -73.6, north: 40.95 };
  const config = {
    bounds,
    zoom: 18,
    worldWidth: 2 ** 28,
    worldHeight: 2 ** 28,
    region: { west: -74, south: 40.7, east: -73.999, north: 40.701 },
  };
  const grid = createFiniteTileGrid(config);
  const small = createFiniteTileGrid({ ...config, worldWidth: 2400, worldHeight: 2400 });
  for (let i = 0; i < grid.points.length; i += 5) {
    for (let axis = 1; axis <= 4; axis++) {
      expect(grid.points[i + axis]).toBeCloseTo((small.points[i + axis] / 2400) * 2 ** 28, 5);
    }
  }
});
