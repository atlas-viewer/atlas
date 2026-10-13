/** @vitest-environment happy-dom */
import { expect, test, vi } from 'vitest';
import { Runtime } from '../../renderer/runtime';
import type { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';
import { CompositeResource } from '../../spacial-content/composite-resource';
import { TiledImage } from '../../spacial-content/tiled-image';
import { DnaFactory, transform } from '../../utility/precise-dna';

function createRuntime() {
  const size = 134217728;
  const image = TiledImage.fromTile('https://example.org/osm', { width: size, height: size }, { width: 256 }, 1);
  const composite = new CompositeResource({ id: 'osm', width: size, height: size, images: [image] });
  composite._sortByScales();
  const world = new World(size, size);
  world.appendChild(new WorldObject({ id: 'canvas', width: size, height: size, layers: [composite] }));
  world.flushSubscriptions();
  const renderer = {
    beforeFrame() {},
    afterFrame() {},
    prepareLayer() {},
    finishLayer() {},
    afterPaintLayer() {},
    resize() {},
    reset() {},
    paint: vi.fn(),
    getScale: (width: number, height: number) => Math.min(1024 / width, 768 / height),
    pendingUpdate: () => false,
    getPointsAt: (scene, target, aggregate, scale) => scene.getPointsAt(target, aggregate, scale),
    getViewportBounds: () => null,
    isReady: () => true,
    getRendererScreenPosition: () => ({ x: 0, y: 0, top: 0, left: 0, width: 1024, height: 768 }),
  } satisfies Renderer;
  const runtime = new Runtime(
    renderer,
    world,
    { x: 119000000.25, y: 52000000.75, width: 1024, height: 768, scale: 1 },
    [],
    { maxOverZoom: 2 }
  );
  runtime.stop();
  return { runtime, world, image };
}

test('subpixel pans survive the complete world → composite → tile → screen transform', () => {
  const { runtime, world } = createRuntime();
  try {
    const position = () => {
      const [paint] = world.getPointsAt(runtime.target, runtime.aggregate, runtime.getScaleFactor());
      return transform(paint[1], paint[2]!);
    };
    const before = position();
    runtime.setViewport({ x: runtime.x + 0.25, y: runtime.y + 0.125 });
    const after = position();
    expect(runtime.x).toBe(119000000.5);
    expect(runtime.y).toBe(52000000.875);
    for (let index = 0; index < before.length; index += 5) {
      expect(after[index + 1] - before[index + 1]).toBeCloseTo(-0.25, 6);
      expect(after[index + 2] - before[index + 2]).toBeCloseTo(-0.125, 6);
      expect(after[index + 3] - after[index + 1]).toBeCloseTo(256, 6);
    }
  } finally {
    runtime.dispose();
  }
});

test('zooming and animation preserve fractional positions near the far side of the image', () => {
  const { runtime } = createRuntime();
  try {
    const origin = runtime.viewerToWorld(321.25, 234.5);
    runtime.target.set(runtime.getZoomedPosition(0.75, { origin }));
    expect(runtime.width).toBeCloseTo(768, 6);
    const screen = runtime.worldToViewer(origin.x, origin.y, 0, 0);
    expect(screen.x).toBeCloseTo(321.25, 5);
    expect(screen.y).toBeCloseTo(234.5, 5);

    const start = runtime.x;
    const next = DnaFactory.singleBox(runtime.width, runtime.height, start + 0.5, runtime.y);
    runtime.transitionManager.applyTransition(next, undefined, { duration: 100, easing: (t) => t });
    runtime.transitionManager.runTransition(runtime.target, 50);
    expect(runtime.x - start).toBeCloseTo(0.25, 6);
  } finally {
    runtime.dispose();
  }
});

test('large partial tiles retain exact geometry and decoded dimensions through culling', () => {
  const width = 2 ** 27 + 3;
  const image = TiledImage.fromTile('/iiif', { width, height: width }, { width: 257 }, 1);
  const [paint] = image.getAllPointsAt(DnaFactory.singleBox(1000, 1000, width - 1000, width - 1000));
  const end = image.points.length - 5;
  const start = Math.floor((width - 1) / 257) * 257;
  expect(Array.from(paint[1].slice(end))).toEqual([1, start, start, width, width]);
  expect(Array.from(image.display.points.slice(end))).toEqual([1, start, start, width, width]);
  expect(image.getImageUrl(end / 5)).toContain(
    `/${start},${start},${width - start},${width - start}/${width - start},/`
  );
  const small = TiledImage.fromTile('/iiif', { width: 4096, height: 4096 }, { width: 256 }, 1);
  expect(small.points.BYTES_PER_ELEMENT).toBe(4);
});

test('world bounds and object transforms retain large fractional coordinates', () => {
  const world = new World(1, 1);
  const object = new WorldObject({ id: 'huge', width: 2 ** 32 + 0.5, height: 1000, layers: [] }, { x: 0.25, y: 0 });
  world.appendChild(object);
  world.recalculateWorldSize();
  expect(world.width).toBe(2 ** 32 + 0.75);
  const before = object.x;
  object.translate(0.125, 0);
  expect(object.x).toBe(before + 0.125);
  object.atScale(1.00000001);
  expect(object.x).toBeCloseTo(before + 0.125, 7);
});
