/** @vitest-environment happy-dom */

import { describe, expect, test } from 'vitest';
import { StaticRenderer } from '../../modules/static-renderer/static-renderer';
import { World } from '../../world';
import { SingleImage } from '../../spacial-content/single-image';

describe('StaticRenderer pendingUpdate', () => {
  test('idle cancels native image loads and resumes them without removing displayed images', () => {
    const renderer = new StaticRenderer(document.createElement('div'));
    const paint = new SingleImage();
    paint.applyProps({ uri: 'https://example.org/static-idle.jpg', target: { width: 100, height: 100 },
      display: { width: 100, height: 100 } } as any);
    renderer.setIdle(true);
    renderer.paint(paint, 0, 0, 0, 100, 100);
    expect(paint.__host).toBeUndefined();
    renderer.setIdle(false);
    renderer.paint(paint, 0, 0, 0, 100, 100);
    const image = paint.__host as HTMLImageElement;
    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    renderer.setIdle(true);
    expect(image.hasAttribute('src')).toBe(false);
    expect(renderer.container.contains(image)).toBe(true);
    renderer.setIdle(false);
    expect(image.src).toBe(paint.uri);
    Object.defineProperty(image, 'complete', { value: true });
    renderer.setIdle(true);
    expect(image.src).toBe(paint.uri);
    renderer.reset();
  });

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
