/** @vitest-environment happy-dom */

import type { Strand } from '@atlas-viewer/dna';
import { describe, expect, test, vi } from 'vitest';
import type { Renderer } from '../../renderer/renderer';
import { Runtime } from '../../renderer/runtime';
import type { PositionPair } from '../../types';
import { World } from '../../world';
import type { Paint } from '../../world-objects/paint';
import { WorldObject } from '../../world-objects/world-object';
import { Zone } from '../../world-objects/zone';

class CountingRenderer implements Renderer {
  beforeFrameCalls = 0;

  beforeFrame(): void {
    this.beforeFrameCalls += 1;
  }
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

function createWorldObject(id: string, x: number, y: number) {
  const object = new WorldObject();
  object.applyProps({ id, x, y, width: 100, height: 100 });
  return object;
}

describe('Runtime zone fade scheduling', () => {
  test('continues rendering while zone visibility fade is active', () => {
    const renderer = new CountingRenderer();
    const world = new World(1000, 1000);
    const zoneAObject = createWorldObject('a', 0, 0);
    const zoneBObject = createWorldObject('b', 300, 0);

    world.appendChild(zoneAObject);
    world.appendChild(zoneBObject);
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        objects: [zoneAObject],
      })
    );
    world.addZone(
      new Zone({
        id: 'zone-b',
        x: 300,
        y: 0,
        width: 100,
        height: 100,
        objects: [zoneBObject],
      })
    );

    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(0);

    const runtime = new Runtime(
      renderer,
      world,
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
    renderer.beforeFrameCalls = 0;

    world.selectZone('zone-a');

    nowSpy.mockReturnValue(1);
    runtime.render(16);
    expect(renderer.beforeFrameCalls).toBe(1);

    nowSpy.mockReturnValue(world.zoneVisibilityFadeDurationMs / 2);
    runtime.render(32);
    expect(renderer.beforeFrameCalls).toBe(2);

    nowSpy.mockReturnValue(world.zoneVisibilityFadeDurationMs + 10);
    runtime.render(48);
    expect(renderer.beforeFrameCalls).toBe(3);

    nowSpy.mockReturnValue(world.zoneVisibilityFadeDurationMs + 20);
    runtime.render(64);
    expect(renderer.beforeFrameCalls).toBe(3);

    nowSpy.mockRestore();
  });
});
