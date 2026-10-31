import { sampleForwardMapMesh, tileForwardMapMesh, MapMeshBudgetError } from '../../../modules/maps/warped/map-mesh';
import { mercatorXToLongitude, mercatorYToLatitude } from '../../../modules/maps/projection';
import type { WarpTransformer } from '../../../modules/maps/warped/types';

const rect = { x: 0, y: 0, width: 1000, height: 700 };
const mask: [number, number][] = [
  [0, 0],
  [1000, 0],
  [1000, 700],
  [0, 700],
];
const project = (x: number, y: number) => [0.49 + x * 0.00004 + y * 0.00001, 0.49 + y * 0.00003 - x * 0.000005];
const transformer: WarpTransformer = {
  type: 'affine',
  toGeo(x, y) {
    const [u, v] = project(x, y);
    return [mercatorXToLongitude(u), mercatorYToLatitude(v)];
  },
  toResource: () => {
    throw new Error('The reverse fit must never be used');
  },
};

test('splits forward triangles across XYZ tiles without changing their image area or registration', () => {
  const sample = sampleForwardMapMesh(transformer, rect);
  const tiles = tileForwardMapMesh(sample, 6, 256, 100, mask);
  expect(tiles.length).toBeGreaterThan(1);
  let area = 0;
  for (const { x, y, mesh } of tiles) {
    for (let i = 0; i < mesh.dst.length; i += 2) {
      const px = mesh.dst[i] + mesh.bounds.x1,
        py = mesh.dst[i + 1] + mesh.bounds.y1;
      const [u, v] = project(px, py);
      expect((x + mesh.src[i] / 256) / 64).toBeCloseTo(u, 8);
      expect((y + mesh.src[i + 1] / 256) / 64).toBeCloseTo(v, 8);
      expect(mesh.src[i]).toBeGreaterThanOrEqual(-0.001);
      expect(mesh.src[i]).toBeLessThanOrEqual(256.001);
      expect(mesh.src[i + 1]).toBeGreaterThanOrEqual(-0.001);
      expect(mesh.src[i + 1]).toBeLessThanOrEqual(256.001);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] * 2,
        b = mesh.indices[i + 1] * 2,
        c = mesh.indices[i + 2] * 2;
      const d = mesh.dst;
      area += Math.abs((d[b] - d[a]) * (d[c + 1] - d[a + 1]) - (d[c] - d[a]) * (d[b + 1] - d[a + 1])) / 2;
    }
  }
  expect(area).toBeCloseTo(700000, 0);
});

test('a nonlinear warp samples the forward transform, including interior extrema', () => {
  const nonlinear: WarpTransformer = {
    type: 'custom',
    toGeo(x, y) {
      return [
        mercatorXToLongitude(0.48 + (0.001 * x) / 1000),
        mercatorYToLatitude(0.45 + y * 0.000001 + 0.08 * Math.sin((Math.PI * x) / 1000)),
      ];
    },
    toResource: transformer.toResource,
  };
  const sample = sampleForwardMapMesh(nonlinear, rect, 32);
  const tiles = tileForwardMapMesh(sample, 6, 256, 100, mask);
  // The bowed interior needs rows that none of the four image corners reach.
  expect(Math.max(...tiles.map((tile) => tile.y))).toBeGreaterThan(32);
  const center = sample.triangles.flat().find((v) => v.x === 500);
  expect(center?.v).toBeGreaterThanOrEqual(0.53);
  expect(sample.triangles.length).toBeGreaterThan(2);
});

test('higher mesh resolution converges toward the original nonlinear registration', () => {
  const nonlinear: WarpTransformer = {
    type: 'custom',
    toGeo(x, y) {
      return [mercatorXToLongitude(0.3 + x * 0.00001), mercatorYToLatitude(0.4 + y * 0.00001 + x * x * 0.00000001)];
    },
  };
  function error(resolution: number) {
    return Math.max(
      ...sampleForwardMapMesh(nonlinear, rect, resolution).triangles.map(([a, b, c]) => {
        const x = (a.x + b.x + c.x) / 3,
          y = (a.y + b.y + c.y) / 3;
        return Math.abs((a.v + b.v + c.v) / 3 - (0.4 + y * 0.00001 + x * x * 0.00000001));
      })
    );
  }
  expect(error(32)).toBeLessThan(error(8) / 10);
});

test('budgets stop an enormous tile range before it can be allocated', () => {
  const sample = sampleForwardMapMesh(transformer, rect);
  expect(() => tileForwardMapMesh(sample, 22, 256, 16, mask)).toThrow(MapMeshBudgetError);
});

test('mask coordinates stay in image space after tile splitting', () => {
  const polygon: [number, number][] = [
    [250, 150],
    [800, 200],
    [400, 600],
  ];
  for (const { mesh } of tileForwardMapMesh(sampleForwardMapMesh(transformer, rect), 6, 256, 100, polygon)) {
    expect(mesh.resourceMask).toBeUndefined();
    for (let i = 0; i < polygon.length; i++) {
      expect(mesh.destinationMask![i * 2] + mesh.bounds.x1).toBeCloseTo(polygon[i][0], 3);
      expect(mesh.destinationMask![i * 2 + 1] + mesh.bounds.y1).toBeCloseTo(polygon[i][1], 3);
    }
  }
});

test('singular and out-of-world triangles cannot produce unbounded tile requests', () => {
  expect(sampleForwardMapMesh({ type: 'custom', toGeo: () => [NaN, 100] }, rect).triangles).toEqual([]);
  expect(sampleForwardMapMesh({ type: 'custom', toGeo: () => [0, 0] }, rect).triangles).toEqual([]);
});
