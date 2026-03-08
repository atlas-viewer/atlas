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
