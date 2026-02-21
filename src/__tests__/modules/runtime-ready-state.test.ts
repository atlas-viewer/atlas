/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';
import { Runtime } from '../../renderer/runtime';
import { World } from '../../world';
import { Renderer } from '../../renderer/renderer';
import { PositionPair } from '../../types';
import { Strand } from '@atlas-viewer/dna';
import { Paint } from '../../world-objects/paint';

class ReadyRenderer implements Renderer {
  ready = false;
  resetReadyState = vi.fn(() => {
    this.ready = false;
  });

  beforeFrame(): void {}
  paint(): void {}
  afterFrame(): void {}
  getScale(): number {
    return 1;
  }
  prepareLayer(): void {}
  finishLayer(): void {}
  afterPaintLayer(): void {}
  pendingUpdate(): boolean {
    return false;
  }
  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }
  getViewportBounds(): PositionPair | null {
    return null;
  }
  isReady(): boolean {
    return this.ready;
  }
  resize(): void {}
  reset(): void {}
  getRendererScreenPosition() {
    return { x: 0, y: 0, top: 0, left: 0, width: 100, height: 100 };
  }
}

describe('Runtime ready lifecycle', () => {
  test('emits ready once per cycle and re-emits after resetReadyState', () => {
    const renderer = new ReadyRenderer();
    const runtime = new Runtime(renderer, new World(100, 100), {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      scale: 1,
    });
    const readyEvents: number[] = [];
    const unsub = runtime.world.addLayoutSubscriber((type) => {
      if (type === 'ready') {
        readyEvents.push(performance.now());
      }
    });

    renderer.ready = true;
    runtime.updateNextFrame();
    runtime.render(performance.now() + 16);
    expect(readyEvents).toHaveLength(1);

    runtime.updateNextFrame();
    runtime.render(performance.now() + 32);
    expect(readyEvents).toHaveLength(1);

    runtime.resetReadyState('manual');
    const resetState = runtime.getReadyState();
    expect(resetState.ready).toBe(false);
    expect(resetState.cycle).toBe(1);
    expect(resetState.reason).toBe('manual');
    expect(resetState.timestamp).toBeUndefined();
    expect(renderer.resetReadyState).toHaveBeenCalledTimes(1);

    renderer.ready = true;
    runtime.updateNextFrame();
    runtime.render(performance.now() + 48);
    expect(readyEvents).toHaveLength(2);

    const readyState = runtime.getReadyState();
    expect(readyState.ready).toBe(true);
    expect(readyState.cycle).toBe(1);
    expect(readyState.reason).toBe('manual');
    expect(typeof readyState.timestamp).toBe('number');

    unsub();
    runtime.stop();
  });

  test('runtime.reset starts a fresh ready cycle with runtime-reset reason', () => {
    const renderer = new ReadyRenderer();
    const runtime = new Runtime(renderer, new World(100, 100), {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      scale: 1,
    });

    renderer.ready = true;
    runtime.updateNextFrame();
    runtime.render(performance.now() + 16);
    expect(runtime.getReadyState().ready).toBe(true);

    runtime.reset();
    const state = runtime.getReadyState();
    expect(state.ready).toBe(false);
    expect(state.reason).toBe('runtime-reset');
    expect(state.cycle).toBe(1);
    expect(renderer.resetReadyState).toHaveBeenCalledTimes(1);

    runtime.stop();
  });
});
