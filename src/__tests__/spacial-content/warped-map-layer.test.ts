import { DnaFactory } from '@atlas-viewer/dna';
import { WarpedMapResource } from '../../spacial-content/warped-map-layer';
import { mercatorXToLongitude, mercatorYToLatitude } from '../../modules/maps/projection';
import type { WarpTransformer } from '../../modules/maps/warped/types';
import { isWarpedImage } from '../../spacial-content/warped-image';

const transformer: WarpTransformer = {
  type: 'affine',
  toGeo: (x, y) => [mercatorXToLongitude(0.3 + x * 1e-6), mercatorYToLatitude(0.4 + y * 1e-6)],
};
const props = { id: 'overlay', imageWidth: 6000, imageHeight: 4000, transformer };

async function frame(layer: WarpedMapResource, x = 0, y = 0, width = 6000, height = 4000, scale = 0.1) {
  const target = DnaFactory.singleBox(width, height, x, y);
  layer.getAllPointsAt(target, undefined, scale);
  for (const update of layer.getScheduledUpdates(target, scale)) await update();
}

test('zooms and pans in image coordinates, reusing a window on small pans', async () => {
  const layer = new WarpedMapResource(props);
  await frame(layer);
  const overviewZoom = layer.zoom;
  expect(layer.images).toHaveLength(1);
  expect(isWarpedImage(layer.images[0])).toBe(true);
  await frame(layer, 2000, 1500, 200, 150, 4);
  expect(layer.zoom).toBeGreaterThan(overviewZoom);
  const window = layer.images[0];
  await frame(layer, 2010, 1510, 200, 150, 4);
  expect(layer.images[0]).toBe(window);
  await frame(layer, 4000, 2500, 200, 150, 4);
  expect(layer.images[0]).not.toBe(window);
  const points = layer.images[0].points;
  expect(Math.max(...Array.from(points).filter((_, i) => i % 5 === 3))).toBeGreaterThan(4200);
  await frame(layer);
  expect(layer.zoom).toBe(overviewZoom);
  expect(layer.images).toHaveLength(1);
});

test('tile budgets choose a coarser zoom rather than dropping tiles from the visible area', async () => {
  const layer = new WarpedMapResource({ ...props, maxTiles: 4 });
  await frame(layer, 0, 0, 6000, 4000, 10);
  const image = layer.images[0];
  expect(image.points.length / 5).toBeLessThanOrEqual(4);
  expect(Math.max(...Array.from(image.points).filter((_, i) => i % 5 === 3))).toBeCloseTo(6000, 2);
});

test('keeps a loaded window through successive zooms until its replacement is ready', async () => {
  const layer = new WarpedMapResource(props);
  await frame(layer);
  const overview = layer.images[0];
  const dispose = vi.fn();
  overview.__host = { canvas: { isTileLoaded: () => true, dispose } };
  await frame(layer);
  await frame(layer, 2000, 1500, 200, 150, 4);
  const firstZoom = layer.images[0];
  const target = DnaFactory.singleBox(200, 150, 2000, 1500);
  const selected = () => layer.getAllPointsAt(target, undefined, 8).map(([image]) => image);
  await frame(layer, 2000, 1500, 200, 150, 8);
  const latest = layer.images[0];
  expect(latest).not.toBe(firstZoom);
  expect(selected()).toEqual([overview, latest]);
  expect(dispose).not.toHaveBeenCalled();
  expect(layer.isImageActive(overview)).toBe(false);
  expect(layer.isImageActive(latest)).toBe(true);
  latest.__host = { canvas: { isTileLoaded: () => true } };
  expect(selected()).toEqual([latest]);
  expect(dispose).toHaveBeenCalledOnce();
  expect(layer.allImages).toEqual([latest]);
  await frame(layer);
  expect(layer.getAllPointsAt(DnaFactory.singleBox(6000, 4000), undefined, 0.1).map(([image]) => image)).toEqual([
    latest,
    layer.images[0],
  ]);
  layer.applyProps({ ...props, tileSource: '/changed/{z}/{x}/{y}' });
  await frame(layer);
  expect(layer.getAllPointsAt(DnaFactory.singleBox(6000, 4000), undefined, 0.1).map(([image]) => image)).toEqual([
    layer.images[0],
  ]);
});

test('opacity updates preserve loaded tiles; a new transform or source invalidates geometry and URLs', async () => {
  const layer = new WarpedMapResource({ ...props, tileSource: '/a/{z}/{x}/{y}' });
  await frame(layer);
  const image = layer.images[0];
  layer.applyProps({ ...props, tileSource: '/a/{z}/{x}/{y}', opacity: 0.35 });
  await frame(layer);
  expect(layer.images[0]).toBe(image);
  expect((image as any).style.opacity).toBe(0.35);
  layer.applyProps({ ...props, tileSource: '/b/{z}/{x}/{y}' });
  await frame(layer);
  expect(layer.images[0]).not.toBe(image);
  expect((layer.images[0] as any).getImageUrl(0)).toMatch(/^\/b\//);
  layer.applyProps({ ...props, transformer: { ...transformer, toGeo: (x, y) => transformer.toGeo(x + 10000, y) } });
  await frame(layer);
  expect(layer.images[0]).not.toBe(image);
});

test('masks can be updated and removed and have no reverse-transform dependency', async () => {
  const resourceMask: [number, number][] = [
    [2000, 1000],
    [4000, 1000],
    [3000, 3000],
  ];
  const layer = new WarpedMapResource({ ...props, resourceMask });
  await frame(layer);
  const image = layer.images[0];
  expect(isWarpedImage(image) && image.getWarpTile(0)?.destinationMask?.length).toBe(6);
  layer.applyProps({ ...props, resourceMask: undefined });
  await frame(layer);
  const unmasked = layer.images[0];
  expect(isWarpedImage(unmasked) && unmasked.getWarpTile(0)?.destinationMask?.length).toBe(8);
});

test('invalid projections are reported once and point hit tests do not replace the viewport', async () => {
  const onError = vi.fn();
  const layer = new WarpedMapResource({ ...props, onError, transformer: { type: 'custom', toGeo: () => [NaN, NaN] } });
  await frame(layer);
  await frame(layer);
  expect(onError).toHaveBeenCalledTimes(1);
  const target = DnaFactory.singleBox(1, 1, 20, 20);
  layer.getAllPointsAt(target, undefined, 1);
  expect(layer.getScheduledUpdates(target, 1)).toEqual([]);
});

test('invalid configuration is rejected before attempting tile work', () => {
  expect(() => new WarpedMapResource({ ...props, imageWidth: Infinity })).toThrow(/dimensions/);
  expect(() => new WarpedMapResource({ ...props, maxZoom: NaN })).toThrow(/zoom/);
  expect(() => new WarpedMapResource({ ...props, maxTiles: 0 })).toThrow(/budget/);
});

test('preserves fractional tile bounds on a very large image', async () => {
  const layer = new WarpedMapResource({
    id: 'large',
    imageWidth: 2 ** 28,
    imageHeight: 2 ** 28,
    transformer: {
      type: 'affine',
      toGeo: (x, y) => [mercatorXToLongitude(0.3 + x * 1e-9), mercatorYToLatitude(0.3 + y * 1e-9)],
    },
  });
  const target = new Float64Array([1, 100000000.125, 100000000.25, 100000100.125, 100000100.25]) as any;
  layer.getAllPointsAt(target, undefined, 4);
  for (const update of layer.getScheduledUpdates(target, 4)) await update();
  expect(layer.images.length).toBe(1);
  const image = layer.images[0] as any;
  for (let i = 0; i < image.tiles.length; i++) {
    const bounds = image.getWarpTile(i).bounds;
    expect(image.points[i * 5 + 1]).toBeCloseTo(bounds.x1, 5);
    expect(image.points[i * 5 + 2]).toBeCloseTo(bounds.y1, 5);
    expect(image.points[i * 5 + 3]).toBeCloseTo(bounds.x2, 5);
    expect(image.points[i * 5 + 4]).toBeCloseTo(bounds.y2, 5);
  }
});
