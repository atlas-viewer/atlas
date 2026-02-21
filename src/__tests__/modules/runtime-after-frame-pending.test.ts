/** @vitest-environment happy-dom */

import type { Strand } from '@atlas-viewer/dna';
import { describe, expect, test } from 'vitest';
import type { Renderer } from '../../renderer/renderer';
import { Runtime } from '../../renderer/runtime';
import type { PositionPair } from '../../types';
import { World } from '../../world';
import type { Paint } from '../../world-objects/paint';

class StaticRenderer implements Renderer {
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
    return true;
  }
  resize(): void {}
  reset(): void {}
  getRendererScreenPosition() {
    return { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 800 };
  }
}

describe('Runtime useAfterFrame scheduling', () => {
  test('preserves updateNextFrame requests made in useAfterFrame', () => {
    const runtime = new Runtime(
      new StaticRenderer(),
      new World(1000, 1000),
      {
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        scale: 1,
      },
      []
    );
    runtime.stop();

    runtime.registerHook('useAfterFrame', () => {
      runtime.updateNextFrame();
    });

    runtime.updateNextFrame();
    runtime.render(performance.now() + 16);

    expect(runtime.pendingUpdate).toBe(true);
  });
});
