/** @vitest-environment happy-dom */

import { DnaFactory } from '@atlas-viewer/dna';
import { afterEach, expect, test, vi } from 'vitest';
import { HomeNavigatorRenderer } from '../../modules/navigator-renderer/home-navigator-renderer';
import {
  getNavigatorWorldTransform,
  rotatedNavigatorToWorldPoint,
} from '../../modules/navigator-renderer/navigator-geometry';
import { Box } from '../../objects/box';
import { TiledImage } from '../../spacial-content/tiled-image';

afterEach(() => vi.unstubAllGlobals());

test('loads tiled previews independently and covers fractional tile boundaries', () => {
  const context = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  } as any;
  const canvas = { width: 101, height: 50, getContext: () => context } as any;
  const requests: MockImage[] = [];
  class MockImage {
    complete = false;
    naturalWidth = 0;
    onload?: () => void;
    onerror?: () => void;
    src = '';
    constructor() {
      requests.push(this);
    }
    load() {
      this.complete = true;
      this.naturalWidth = 50;
      this.onload?.();
    }
  }
  vi.stubGlobal('Image', MockImage);
  const tiled = TiledImage.fromTile('https://example.org/iiif', { width: 100, height: 50 }, { width: 50 }, 1);
  const world = {
    width: 100,
    height: 50,
    getPointsAt: vi.fn(() => [[tiled, tiled.points]]),
  } as any;
  const requestRender = vi.fn();
  const renderer = new HomeNavigatorRenderer(canvas, { onRequestRender: requestRender });
  renderer.setRegion({ x: 0, y: 0, width: 100, height: 50 });
  renderer.afterFrame(world, 0, DnaFactory.singleBox(40, 20, 20, 10));
  expect(requests).toHaveLength(2);
  expect(requests[0].src).toContain('/0,0,50,50/');
  expect(context.drawImage).not.toHaveBeenCalled();

  requests.forEach((image) => image.load());
  renderer.afterFrame(world, 0, DnaFactory.singleBox(40, 20, 20, 10));
  const first = context.drawImage.mock.calls[0];
  const second = context.drawImage.mock.calls[1];
  expect(first.slice(-4)).toEqual([0, 0, 51, 50]);
  expect(second.slice(-4)).toEqual([50, 0, 51, 50]);
  expect(context.strokeRect).toHaveBeenCalled();
  expect(requestRender).toHaveBeenCalled();
});

test('limits preview requests and continues the queue when a tile finishes', () => {
  const context = {
    globalAlpha: 1,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as any;
  const requests: Array<{ complete: boolean; naturalWidth: number; onload?: () => void }> = [];
  class MockImage {
    complete = false;
    naturalWidth = 0;
    onload?: () => void;
    src = '';
    constructor() {
      requests.push(this);
    }
  }
  vi.stubGlobal('Image', MockImage);
  const tiled = TiledImage.fromTile('https://example.org/iiif', { width: 250, height: 50 }, { width: 50 }, 1);
  const world = { width: 250, height: 50, getPointsAt: () => [[tiled, tiled.points]] } as any;
  const renderer = new HomeNavigatorRenderer({ width: 250, height: 50, getContext: () => context } as any);
  const target = DnaFactory.singleBox(100, 50);
  renderer.afterFrame(world, 0, target);
  expect(requests).toHaveLength(4);
  requests[0].complete = true;
  requests[0].naturalWidth = 50;
  requests[0].onload?.();
  renderer.afterFrame(world, 0, target);
  expect(requests).toHaveLength(5);
});

test('only draws annotation boxes when configured', () => {
  const box = new Box();
  box.points.set(DnaFactory.singleBox(20, 20, 10, 10));
  const world = { width: 100, height: 100, getPointsAt: () => [[box, box.points]] } as any;
  const target = DnaFactory.singleBox(50, 50);
  const makeCanvas = () => {
    const context = {
      globalAlpha: 1,
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    } as any;
    return { canvas: { width: 100, height: 100, getContext: () => context } as any, context };
  };
  const hidden = makeCanvas();
  const hiddenRenderer = new HomeNavigatorRenderer(hidden.canvas);
  hiddenRenderer.afterFrame(world, 0, target);
  expect(hidden.context.strokeRect).toHaveBeenCalledTimes(1); // viewport outline

  hiddenRenderer.setShowAnnotations(true);
  hiddenRenderer.afterFrame(world, 0, target);
  expect(hidden.context.strokeRect).toHaveBeenCalledTimes(3);

  const visible = makeCanvas();
  new HomeNavigatorRenderer(visible.canvas, { showAnnotations: true }).afterFrame(world, 0, target);
  expect(visible.context.strokeRect).toHaveBeenCalledTimes(2);
});

test('omits the viewport outline at home zoom, including when panned', () => {
  const context = {
    globalAlpha: 1,
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as any;
  const canvas = { width: 100, height: 100, getContext: () => context } as any;
  const world = { width: 100, height: 100, getPointsAt: () => [] } as any;
  const renderer = new HomeNavigatorRenderer(canvas);
  renderer.setRegion({ x: 0, y: 0, width: 100, height: 100 });
  renderer.afterFrame(world, 0, DnaFactory.singleBox(100, 100, 10, 0));
  expect(context.strokeRect).not.toHaveBeenCalled();
  renderer.afterFrame(world, 0, DnaFactory.singleBox(50, 50));
  expect(context.strokeRect).toHaveBeenCalledTimes(1);
});

test('reads viewport outline style from CSS variables', () => {
  const context = {
    globalAlpha: 1,
    clearRect: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as any;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 100;
  canvas.style.setProperty('--atlas-navigator-viewport-stroke', 'magenta');
  canvas.style.setProperty('--atlas-navigator-viewport-line-width', '3px');
  (canvas as any).getContext = () => context;
  document.body.appendChild(canvas);
  const renderer = new HomeNavigatorRenderer(canvas);
  const world = { width: 100, height: 100, getPointsAt: () => [] } as any;
  renderer.setRegion({ x: 0, y: 0, width: 100, height: 100 });
  renderer.afterFrame(world, 0, DnaFactory.singleBox(50, 50));
  expect(context.strokeStyle).toBe('magenta');
  expect(context.lineWidth).toBe(3);
  canvas.remove();
});

test('rotates the scene, queries tiles that rotate into view, and keeps the viewport outline aligned', () => {
  const context = {
    globalAlpha: 1,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    strokeRect: vi.fn(),
  } as any;
  const canvas = { width: 200, height: 100, getContext: () => context } as any;
  const world = { width: 200, height: 100, getPointsAt: vi.fn(() => []) } as any;
  const renderer = new HomeNavigatorRenderer(canvas);
  renderer.setRegion({ x: 0, y: 0, width: 200, height: 100 });
  const target = DnaFactory.singleBox(40, 20, 80, 65);

  renderer.beforeFrame(world, 0, target, { viewRotation: 90 });
  renderer.afterFrame(world, 0, target);

  expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
  const selection = world.getPointsAt.mock.calls[0][3];
  expect([selection[1], selection[2], selection[3], selection[4]]).toEqual([50, -50, 150, 150]);
  expect(context.strokeRect.mock.calls[0][0]).toBeCloseTo(55.5, 0);
  expect(context.strokeRect.mock.calls[0][1]).toBeCloseTo(40.5, 0);

  const transform = getNavigatorWorldTransform(200, 100, 200, 100);
  expect(rotatedNavigatorToWorldPoint(transform, 75, 50, 90)).toEqual({ x: 100, y: 75 });
});
