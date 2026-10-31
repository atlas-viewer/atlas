import { DEFAULT_OSM_TILE_TEMPLATE, resolveTileTemplate, resolveTileUrl } from '../../../modules/maps/tile-source';

describe('map tile source', () => {
  test('uses default OSM template substitution', () => {
    const url = resolveTileUrl(undefined, { z: 10, x: 301, y: 385 });

    expect(url).toEqual('https://tile.openstreetmap.org/10/301/385.png');
    expect(resolveTileTemplate(DEFAULT_OSM_TILE_TEMPLATE, { z: 1, x: 2, y: 3 })).toEqual(
      'https://tile.openstreetmap.org/1/2/3.png'
    );
  });

  test('supports subdomain substitution from template', () => {
    const url = resolveTileUrl('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      z: 8,
      x: 100,
      y: 200,
      subdomains: ['a', 'b', 'c'],
    });

    expect(url).toMatch(/^https:\/\/[abc]\.tile\.opentopomap\.org\/8\/100\/200\.png$/);
  });

  test('supports function tile source', () => {
    const url = resolveTileUrl(
      ({ z, x, y }) => {
        return `https://tiles.example.org/${z}/${x}/${y}.webp`;
      },
      {
        z: 12,
        x: 1450,
        y: 2450,
      }
    );

    expect(url).toEqual('https://tiles.example.org/12/1450/2450.webp');
  });
});

describe('extra tile tokens', () => {
  test('resolves TMS rows, retina suffix and quadkeys', async () => {
    const { resolveTileTemplate, tileToQuadkey } = await import('../../../modules/maps/tile-source');
    expect(resolveTileTemplate('/{z}/{x}/{-y}.png', { z: 3, x: 2, y: 1 })).toBe('/3/2/6.png');
    expect(resolveTileTemplate('/{z}/{x}/{y}{r}.png', { z: 3, x: 2, y: 1, retina: true })).toBe('/3/2/1@2x.png');
    expect(resolveTileTemplate('/{z}/{x}/{y}{r}.png', { z: 3, x: 2, y: 1 })).toBe('/3/2/1.png');
    // Bing's documented example: tile (3, 5) at level 3 is quadkey 213.
    expect(tileToQuadkey(3, 5, 3)).toBe('213');
    expect(resolveTileTemplate('https://t.example/{q}.jpg', { z: 3, x: 3, y: 5 })).toBe('https://t.example/213.jpg');
  });
});
