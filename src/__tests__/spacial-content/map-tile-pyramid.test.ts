import { DnaFactory } from '@atlas-viewer/dna';
import { MapTilePyramid, planMapTileLevels } from '../../spacial-content/map-tile-pyramid';
import { MapTiledImage } from '../../spacial-content/map-tiled-image';

const NYC = { west: -74.3, south: 40.45, east: -73.6, north: 40.95 };
const WORLD = { worldWidth: 2400, worldHeight: 1600 };

function runUpdates(pyramid: MapTilePyramid) {
  for (const update of pyramid.getScheduledUpdates(DnaFactory.singleBox(1, 1), 1)) {
    update();
  }
}

/** Simulates one rendered frame looking at `rect` (map frame units) at `scale` screen px per unit. */
function frame(pyramid: MapTilePyramid, rect: { x: number; y: number; width: number; height: number }, scale: number) {
  const target = DnaFactory.singleBox(rect.width, rect.height, rect.x, rect.y);
  pyramid.getAllPointsAt(target, undefined, scale);
  runUpdates(pyramid);
}

describe('planMapTileLevels', () => {
  test('builds levels up to the per layer tile budget', () => {
    const plan = planMapTileLevels({ bounds: NYC, ...WORLD, minZoom: 0, maxZoom: 21, maxTilesPerLayer: 16384 });
    const zooms = plan.levels.map((level) => level.zoom);
    expect(zooms[zooms.length - 1]).toBe(16);
    expect(plan.maxZoom).toBe(21);
  });

  test('level scale factors halve with every zoom', () => {
    const plan = planMapTileLevels({ bounds: NYC, ...WORLD, minZoom: 10, maxZoom: 12 });
    const [z10, z11, z12] = plan.levels;
    expect(z10.scaleFactor / z11.scaleFactor).toBeCloseTo(2, 6);
    expect(z11.scaleFactor / z12.scaleFactor).toBeCloseTo(2, 6);
    expect(plan.zoomZeroScale / 2 ** 10).toBeCloseTo(z10.scaleFactor, 6);
  });

  test('keeps the lowest level plus the deepest levels when trimming quality levels', () => {
    const plan = planMapTileLevels({ bounds: NYC, ...WORLD, minZoom: 0, maxZoom: 14, maxQualityLevels: 4 });
    expect(plan.levels.map((level) => level.zoom)).toEqual([0, 12, 13, 14]);
  });

  test('falls back to a coarser zoom when even minZoom exceeds the budget', () => {
    const plan = planMapTileLevels({ bounds: NYC, ...WORLD, minZoom: 18, maxZoom: 19, maxTilesPerLayer: 500 });
    expect(plan.levels).toHaveLength(1);
    expect(plan.levels[0].coverage.count).toBeLessThanOrEqual(500);
    expect(plan.levels[0].zoom).toBeLessThan(18);
  });
});

describe('MapTilePyramid', () => {
  test('keeps every fine level instead of collapsing them by scale gap', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 16,
      viewportWindows: false,
    });
    pyramid._sortByScales();

    // z15 and z16 have scales below 0.25; the default IIIF scale gap used to drop them.
    const zooms = pyramid.images.map((image) => (image as MapTiledImage).zoom).sort((a, b) => a - b);
    expect(zooms).toEqual([10, 11, 12, 13, 14, 15, 16]);
  });

  test('deeper zooms are built as viewport windows rather than for the whole bounds', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 21,
      maxTilesPerLayer: 4096,
    });
    pyramid._sortByScales();
    const staticMax = pyramid.staticMaxZoom;
    expect(staticMax).toBeLessThan(21);
    expect(pyramid.windowZooms).toEqual([]);

    // Zoomed far in on a small area: ~20 screen px per map unit.
    frame(pyramid, { x: 1000, y: 700, width: 60, height: 40 }, 20);

    expect(pyramid.windowZooms.length).toBeGreaterThan(0);
    expect(Math.min(...pyramid.windowZooms)).toBe(staticMax + 1);

    const windows = pyramid.allImages.filter((image) => (image as MapTiledImage).region) as MapTiledImage[];
    expect(windows.length).toBe(pyramid.windowZooms.length);
    for (const window of windows) {
      // Windows are small compared to a full grid at the same zoom.
      expect(window.tileCoordinates.length).toBeLessThanOrEqual(2048);
      expect(window.zoom).toBeGreaterThan(staticMax);
    }
    // And they take part in level selection (fine levels exist in `images`).
    const imageZooms = pyramid.images.map((image) => (image as MapTiledImage).zoom);
    expect(Math.max(...imageZooms)).toBe(Math.max(...pyramid.windowZooms));
  });

  test('windows cover the viewport and are rebuilt only after panning away', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 21,
      maxTilesPerLayer: 4096,
    });
    pyramid._sortByScales();

    frame(pyramid, { x: 1000, y: 700, width: 60, height: 40 }, 20);
    const first = pyramid.allImages.filter((image) => (image as MapTiledImage).region);
    const firstIds = first.map((image) => image.id);

    // A small pan stays inside the window margin: same window images.
    frame(pyramid, { x: 1010, y: 705, width: 60, height: 40 }, 20);
    expect(pyramid.allImages.filter((image) => (image as MapTiledImage).region).map((image) => image.id)).toEqual(
      firstIds
    );

    // A large pan leaves the window; windows are rebuilt around the new viewport.
    frame(pyramid, { x: 1900, y: 1200, width: 60, height: 40 }, 20);
    const rebuilt = pyramid.allImages.filter((image) => (image as MapTiledImage).region);
    expect(rebuilt.map((image) => image.id)).not.toEqual(firstIds);
    expect(rebuilt).toHaveLength(first.length);

    // The new windows contain tiles under the new viewport.
    const top = rebuilt.find(
      (image) => (image as MapTiledImage).zoom === Math.max(...pyramid.windowZooms)
    ) as MapTiledImage;
    const p = top.points;
    let covers = false;
    for (let i = 0; i < top.tileCoordinates.length; i++) {
      const x1 = p[i * 5 + 1];
      const y1 = p[i * 5 + 2];
      const x2 = p[i * 5 + 3];
      const y2 = p[i * 5 + 4];
      if (x1 <= 1930 && x2 >= 1930 && y1 <= 1220 && y2 >= 1220) {
        covers = true;
      }
    }
    expect(covers).toBe(true);
  });

  test('windows are dropped again when zooming back out', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 21,
      maxTilesPerLayer: 4096,
    });
    pyramid._sortByScales();

    frame(pyramid, { x: 1000, y: 700, width: 60, height: 40 }, 20);
    expect(pyramid.windowZooms.length).toBeGreaterThan(0);

    frame(pyramid, { x: 0, y: 0, width: 2400, height: 1600 }, 0.4);
    expect(pyramid.windowZooms).toEqual([]);
    expect(pyramid.allImages.every((image) => !(image as MapTiledImage).region)).toBe(true);
  });

  test('ignores point (hit test) selections when tracking the viewport', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 21,
      maxTilesPerLayer: 4096,
    });
    pyramid._sortByScales();
    pyramid.getAllPointsAt(DnaFactory.singleBox(1, 1, 1000, 700), undefined, 20);
    runUpdates(pyramid);
    expect(pyramid.windowZooms).toEqual([]);
  });

  test('viewportWindows: false caps zoom at the tile budget', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 21,
      maxTilesPerLayer: 4096,
      viewportWindows: false,
    });
    pyramid._sortByScales();
    frame(pyramid, { x: 1000, y: 700, width: 60, height: 40 }, 20);
    expect(pyramid.windowZooms).toEqual([]);
    expect(Math.max(...pyramid.zoomLevels)).toBe(pyramid.staticMaxZoom);
  });

  test('applyProps rebuilds on source/geometry changes only', () => {
    const pyramid = new MapTilePyramid({
      id: 'p',
      bounds: NYC,
      ...WORLD,
      minZoom: 8,
      maxZoom: 10,
      sourceKey: 'osm',
    });
    const builds = pyramid.buildCount;

    pyramid.applyProps({ bounds: { ...NYC }, worldWidth: 2400, worldHeight: 1600, sourceKey: 'osm' });
    expect(pyramid.buildCount).toBe(builds);

    pyramid.applyProps({ sourceKey: 'topo', tileUrlTemplate: 'https://tiles.example/{z}/{x}/{y}.png' });
    expect(pyramid.buildCount).toBe(builds + 1);
    expect((pyramid.allImages[0] as MapTiledImage).getImageUrl(0)).toContain('https://tiles.example/');

    pyramid.applyProps({ worldWidth: 1200, worldHeight: 800, sourceKey: 'topo' });
    expect(pyramid.buildCount).toBe(builds + 2);
    expect(pyramid.display.width).toBe(1200);
    expect(pyramid.points[3]).toBe(1200);
  });

  test('render options from props are applied on top of the map defaults', () => {
    const pyramid = new MapTilePyramid({ id: 'p', bounds: NYC, ...WORLD, minZoom: 8, maxZoom: 9 });
    expect(pyramid.renderOptions.minScaleGap).toBe(0);
    pyramid.applyProps({ renderOptions: { fadeInMs: 50 } });
    expect(pyramid.renderOptions.fadeInMs).toBe(50);
    expect(pyramid.renderOptions.minScaleGap).toBe(0);
  });
});

test('budget-constrained windows do not rebuild for an unchanged viewport', () => {
  const pyramid = new MapTilePyramid({
    id: 'tight-budget',
    bounds: NYC,
    ...WORLD,
    minZoom: 8,
    maxZoom: 21,
    maxTilesPerLayer: 100,
    maxTilesPerWindow: 8,
  });
  pyramid._sortByScales();
  const viewport = { x: 1000, y: 700, width: 60, height: 40 };
  frame(pyramid, viewport, 20);
  const refresh = vi.spyOn(pyramid, 'refreshWindows');
  const ids = pyramid.allImages.map((image) => image.id);
  for (let i = 0; i < 5; i++) frame(pyramid, viewport, 20);
  expect(refresh).not.toHaveBeenCalled();
  expect(pyramid.allImages.map((image) => image.id)).toEqual(ids);
});

test('the coarsest fallback respects the total tile budget', () => {
  const plan = planMapTileLevels({
    bounds: NYC,
    ...WORLD,
    minZoom: 18,
    maxZoom: 19,
    maxTilesPerLayer: 16000,
    maxTotalTiles: 10,
  });
  expect(plan.levels.reduce((sum, level) => sum + level.coverage.count, 0)).toBeLessThanOrEqual(10);
});

test.each([
  { maxZoom: NaN },
  { minZoom: Infinity },
  { maxQualityLevels: 0 },
  { maxTotalTiles: -1 },
  { tileSize: -256 },
  { worldWidth: NaN },
])('rejects invalid tile plans: %o', (invalid) => {
  expect(() => planMapTileLevels({ bounds: NYC, ...WORLD, ...invalid })).toThrow();
});

test('removing optional tile props restores their defaults', () => {
  const pyramid = new MapTilePyramid({
    id: 'reset-props',
    bounds: NYC,
    ...WORLD,
    maxZoom: 9,
    retina: true,
    subdomains: ['a'],
    maxTilesPerLayer: 1,
    tileUrlTemplate: 'https://{s}tiles.example/{z}/{x}/{y}{r}.png',
  });
  pyramid.applyProps({ retina: undefined, subdomains: undefined, maxTilesPerLayer: undefined });
  expect(pyramid.staticMaxZoom).toBe(9);
  const image = pyramid.allImages[0] as MapTiledImage;
  expect(image.retina).toBe(false);
  expect(image.subdomains).toEqual([]);
  expect(image.getImageUrl(0)).not.toContain('@2x');
});
