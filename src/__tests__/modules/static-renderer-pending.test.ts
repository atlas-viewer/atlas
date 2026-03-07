/** @vitest-environment happy-dom */

import { describe, expect, test } from 'vitest';
import { StaticRenderer } from '../../modules/static-renderer/static-renderer';
import { World } from '../../world';

describe('StaticRenderer pendingUpdate', () => {
  test('clears the initial pending state after an empty frame and rearms on resize', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    });

    const renderer = new StaticRenderer(container);
    const world = new World(1000, 1000);
    const target = new Float32Array([1, 0, 0, 1000, 1000]);

    expect(renderer.pendingUpdate()).toBe(true);

    renderer.beforeFrame(world, 16, target);
    renderer.afterFrame(world, 16, target);

    expect(renderer.pendingUpdate()).toBe(false);

    renderer.resize();

    expect(renderer.pendingUpdate()).toBe(true);
  });
});
