/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';
import type { Renderer } from '../../renderer/renderer';
import { Runtime } from '../../renderer/runtime';
import { World } from '../../world';

function createRuntime() {
  // The DOM measurement can still describe the old canvas during a resize.
  const renderer = {
    beforeFrame() {},
    paint() {},
    afterFrame() {},
    getScale: (width: number, height: number) => Math.min(546 / width, 711 / height),
    prepareLayer() {},
    finishLayer() {},
    afterPaintLayer() {},
    pendingUpdate: () => false,
    getPointsAt: () => [],
    getViewportBounds: () => null,
    isReady: () => true,
    resize() {},
    reset() {},
    getRendererScreenPosition: () => ({ x: 0, y: 0, top: 0, left: 0, width: 546, height: 711 }),
  } satisfies Renderer;
  const runtime = new Runtime(renderer, new World(3037, 4000), { x: 0, y: 0, width: 546, height: 711, scale: 1 });
  runtime.stop();
  return runtime;
}

describe('Runtime resizing', () => {
  test.each([0, 5, { left: 20, right: 40, top: 10, bottom: 30 }])(
    'preserves the focal point without accumulating home padding %j',
    (padding) => {
      for (const rotation of [0, 37, 90]) {
        const runtime = createRuntime();
        runtime.setHomePaddingPx(padding);
        runtime.viewRotation = rotation;
        runtime.goHome();
        const before = { ...runtime.getViewport() };

        for (let i = 0; i < 10; i++) {
          runtime.resize(546, 355, 711, 711);
          expect(runtime.width / runtime.height).toBeCloseTo(355 / 711, 3);
          runtime.resize(355, 546, 711, 711);
        }

        const after = runtime.getViewport();
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(2);
        }
      }
    }
  );

  test('preserves a zoomed and panned view across width and height changes', () => {
    const runtime = createRuntime();
    runtime.setHomePaddingPx(5);
    runtime.setViewport({ x: 800, y: 900, width: 546, height: 711 });
    const update = vi.spyOn(runtime, 'updateControllerPosition');
    runtime.resize(546, 900, 711, 400);
    expect(runtime.width / runtime.height).toBeCloseTo(900 / 400, 2);
    expect(Math.abs(runtime.x + runtime.width / 2 - 1073)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(runtime.y + runtime.height / 2 - 1255.5)).toBeLessThanOrEqual(0.5);
    runtime.resize(900, 546, 400, 711);
    expect(runtime.width).toBe(546);
    expect(runtime.height).toBe(711);
    expect(Math.abs(runtime.x - 800)).toBeLessThanOrEqual(1);
    expect(Math.abs(runtime.y - 900)).toBeLessThanOrEqual(1);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
