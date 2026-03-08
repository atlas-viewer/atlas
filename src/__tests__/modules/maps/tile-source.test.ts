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
