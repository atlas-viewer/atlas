import { createInitialGrid, generateSparseGrid, sparseGridDefaults } from '../../clean-objects/traits/sparse-grid';
import { applyGenericObjectProps, genericObjectDefaults } from '../../clean-objects/traits/generic-object';
import { lat2tile, lon2tile } from '../../clean-objects/helpers/maps';

describe('Sparse grid', function () {
  test('generate simple grid, first tile', () => {
    const object = {
      ...sparseGridDefaults(
        createInitialGrid({ width: 256 }, { width: 1024, height: 1024 }, (dims) => `[tile ${dims.x},${dims.y}]`)
      ),
      ...genericObjectDefaults('node'),
    };

    const { loaded } = generateSparseGrid(object, { x: 0, y: 0, width: 10, height: 10 });

    expect(loaded).toEqual(1);
    expect(object.points[1]).toEqual(0);
    expect(object.points[2]).toEqual(0);
    expect(object.points[3]).toEqual(256);
    expect(object.points[4]).toEqual(256);

    expect(object.sparseGrid!.state).toEqual({
      loadedMap: {
        0: { 0: true },
      },
      totalLoaded: 1,
    });
  });

  test('Open street map sized grid (zoom = 15)', () => {
    const zoom = 15;
    const statueOfLiberty = [40.69009, -74.04491];

    const object = {
      ...sparseGridDefaults(
        createInitialGrid(
          { width: 256 },
          { width: Math.pow(2, zoom) * 256, height: Math.pow(2, zoom) * 256 },
          (dims) => `https://a.tile.thunderforest.com/cycle/${zoom}/${dims.x / 256}/${dims.y / 256}.png`
        )
      ),
      ...genericObjectDefaults('node'),
    };

    applyGenericObjectProps(object, {
      target: {
        width: object.sparseGrid.width,
        height: object.sparseGrid.height,
      },
      display: {
        width: object.sparseGrid.width,
        height: object.sparseGrid.height,
      },
    });

    expect(object.display.width).toEqual(8388608);
    expect(object.display.height).toEqual(8388608);

    const point = { y: lat2tile(statueOfLiberty[0], zoom), x: lon2tile(statueOfLiberty[1], zoom) };

    expect(point).toEqual({
      x: 9644,
      y: 12322,
    });

    // Wrap in 3x3
    const box = {
      x: (point.x - 1) * 256,
      y: (point.y - 1) * 256,
      width: 768,
      height: 768,
    };

    expect(object.sparseGrid?.generateTileUrl(box)).toEqual(`https://a.tile.thunderforest.com/cycle/15/9643/12321.png`);

    const { loaded } = generateSparseGrid(object, box);

    expect(loaded).toEqual(9);

    const points = [];
    const urls = [];
    for (let i = 0; i < object.sparseGrid.state.totalLoaded; i++) {
      const x = object.points[i * 5 + 1];
      const y = object.points[i * 5 + 2];

      points.push({ x, y });
      urls.push(object.sparseGrid.generateTileUrl({ x, y }));
    }

    expect(points).toEqual([
      { x: 2468608, y: 3154176 },
      { x: 2468608, y: 3154432 },
      { x: 2468608, y: 3154688 },
      { x: 2468864, y: 3154176 },
      { x: 2468864, y: 3154432 },
      { x: 2468864, y: 3154688 },
      { x: 2469120, y: 3154176 },
      { x: 2469120, y: 3154432 },
      { x: 2469120, y: 3154688 },
    ]);

    expect(urls).toEqual([
      'https://a.tile.thunderforest.com/cycle/15/9643/12321.png',
      'https://a.tile.thunderforest.com/cycle/15/9643/12322.png',
      'https://a.tile.thunderforest.com/cycle/15/9643/12323.png',
      'https://a.tile.thunderforest.com/cycle/15/9644/12321.png',
      'https://a.tile.thunderforest.com/cycle/15/9644/12322.png',
      'https://a.tile.thunderforest.com/cycle/15/9644/12323.png',
      'https://a.tile.thunderforest.com/cycle/15/9645/12321.png',
      'https://a.tile.thunderforest.com/cycle/15/9645/12322.png',
      'https://a.tile.thunderforest.com/cycle/15/9645/12323.png',
    ]);
  });

  test('More than one tile', () => {
    const object = {
      ...sparseGridDefaults(
        createInitialGrid({ width: 50 }, { width: 2000, height: 2000 }, (dims) => `[tile ${dims.x},${dims.y}]`)
      ),
      ...genericObjectDefaults('node'),
    };

    // Top left tile
    const { loaded: g_1 } = generateSparseGrid(object, { x: 0, y: 0, width: 10, height: 10 });
    expect(object.sparseGrid.state.totalLoaded).toEqual(1);
    expect(g_1).toEqual(1);

    // Then a bigger-overlapping bit
    const { loaded: g_2 } = generateSparseGrid(object, { x: 0, y: 0, width: 200, height: 200 });
    expect(object.sparseGrid.state.totalLoaded).toEqual(16);
    expect(g_2).toEqual(15);

    // Completely separate bit..
    const { loaded: g_3 } = generateSparseGrid(object, { x: 500, y: 200, width: 200, height: 200 });
    expect(object.sparseGrid.state.totalLoaded).toEqual(32);
    expect(g_3).toEqual(16);

    // And then overlap that...
    const { loaded: g_4 } = generateSparseGrid(object, { x: 600, y: 310, width: 200, height: 200 });
    expect(object.sparseGrid.state.totalLoaded).toEqual(48);
    expect(g_4).toEqual(16);

    // And then a massive chunk.
    const { loaded: g_5 } = generateSparseGrid(object, { x: 100, y: 100, width: 1900, height: 1900 });
    expect(object.sparseGrid.state.totalLoaded).toEqual(1456);
    expect(g_5).toEqual(1408);
  });
});
