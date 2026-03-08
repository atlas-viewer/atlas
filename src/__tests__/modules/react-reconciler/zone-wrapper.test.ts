/** @vitest-environment happy-dom */

import type { Strand } from '@atlas-viewer/dna';
import React from 'react';
import { ReactAtlas } from '../../../modules/react-reconciler/reconciler';
import type { Renderer } from '../../../renderer/renderer';
import { Runtime } from '../../../renderer/runtime';
import type { PositionPair } from '../../../types';
import { World } from '../../../world';
import type { Paint } from '../../../world-objects/paint';

class MockRenderer implements Renderer {
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

function createRuntime() {
  const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
    x: 0,
    y: 0,
    width: 1000,
    height: 800,
    scale: 1,
  });
  runtime.stop();
  return runtime;
}

async function flushRender() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('zone wrapper reconciler behavior', () => {
  test('registers direct world-object children to zone', async () => {
    const runtime = createRuntime();

    ReactAtlas.render(
      React.createElement(
        'zone',
        { id: 'page-1', x: 0, y: 0, width: 240, height: 100 },
        React.createElement('world-object', {
          id: 'a',
          width: 100,
          height: 100,
          x: 0,
          y: 0,
        }),
        React.createElement('world-object', {
          id: 'b',
          width: 100,
          height: 100,
          x: 120,
          y: 0,
        })
      ),
      runtime
    );
    await flushRender();

    const zone = runtime.world.getZoneById('page-1');
    expect(zone).toBeDefined();
    expect(zone!.objects.map((object) => object.id)).toEqual(['a', 'b']);
    expect(runtime.world.getObjects().filter(Boolean)).toHaveLength(2);
  });

  test('does not register non-direct descendants to zone', async () => {
    const runtime = createRuntime();

    ReactAtlas.render(
      React.createElement(
        'zone',
        { id: 'page-2', x: 0, y: 0, width: 200, height: 200 },
        React.createElement(
          'world-object',
          { id: 'direct', width: 200, height: 200, x: 0, y: 0 },
          React.createElement('world-object', {
            id: 'nested',
            width: 50,
            height: 50,
            x: 10,
            y: 10,
          })
        )
      ),
      runtime
    );
    await flushRender();

    const zone = runtime.world.getZoneById('page-2');
    expect(zone).toBeDefined();
    expect(zone!.objects.map((object) => object.id)).toEqual(['direct']);
  });

  test('unmount removes zone membership cleanly', async () => {
    const runtime = createRuntime();

    ReactAtlas.render(
      React.createElement(
        'zone',
        { id: 'page-3', x: 0, y: 0, width: 120, height: 120 },
        React.createElement('world-object', {
          id: 'only',
          width: 120,
          height: 120,
          x: 0,
          y: 0,
        })
      ),
      runtime
    );
    await flushRender();
    expect(runtime.world.hasZone('page-3')).toBe(true);

    ReactAtlas.render(null, runtime);
    await flushRender();
    expect(runtime.world.hasZone('page-3')).toBe(false);
    expect(runtime.world.zones).toHaveLength(0);
  });
});
