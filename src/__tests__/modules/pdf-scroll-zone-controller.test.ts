/** @vitest-environment happy-dom */

import type { Strand } from '@atlas-viewer/dna';
import { pdfScrollZoneController } from '../../modules/pdf-scroll-zone-controller/pdf-scroll-zone-controller';
import type { Renderer } from '../../renderer/renderer';
import { Runtime } from '../../renderer/runtime';
import type { PositionPair } from '../../types';
import { World } from '../../world';
import type { Paint } from '../../world-objects/paint';
import { WorldObject } from '../../world-objects/world-object';
import { Zone } from '../../world-objects/zone';

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

function createPage(id: string, y: number) {
  const object = new WorldObject();
  object.applyProps({
    id: `${id}-object`,
    x: 0,
    y,
    width: 1000,
    height: 1200,
  });
  return object;
}

function createRuntimeWithPdfController() {
  const world = new World(1000, 3000);
  const page1 = createPage('page-1', 0);
  const page2 = createPage('page-2', 1280);
  world.appendChild(page1);
  world.appendChild(page2);
  world.addZone(new Zone({ id: 'page-1', x: 0, y: 0, width: 1000, height: 1200, objects: [page1] }));
  world.addZone(new Zone({ id: 'page-2', x: 0, y: 1280, width: 1000, height: 1200, objects: [page2] }));

  const runtime = new Runtime(
    new MockRenderer(),
    world,
    {
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      scale: 1,
    },
    [pdfScrollZoneController()]
  );
  runtime.stop();
  world.flushSubscriptions();

  return runtime;
}

function emitClick(runtime: Runtime, x: number, y: number) {
  runtime.world.propagatePointerEvent('onClick' as any, { atlas: { x, y } } as any, x, y);
  runtime.world.flushSubscriptions();
}

function emitWheel(runtime: Runtime, x: number, y: number, deltaY: number) {
  runtime.world.propagatePointerEvent(
    'onWheel' as any,
    {
      atlas: { x, y },
      deltaY,
      preventDefault: () => {},
    } as any,
    x,
    y
  );
  runtime.world.flushSubscriptions();
}

describe('pdf scroll zone controller', () => {
  test('initializes at the top of the first page in scroll-mode', () => {
    const runtime = createRuntimeWithPdfController();
    const viewport = runtime.getViewport();

    expect(runtime.mode).toBe('sketch');
    expect(viewport.x).toBeLessThan(0);
    expect(viewport.y).toBe(0);
    expect(viewport.width).toBeGreaterThan(1000);
    expect(viewport.height).toBeGreaterThan(800);
  });

  test('scroll-mode supports vertical wheel navigation', () => {
    const runtime = createRuntimeWithPdfController();
    const startY = runtime.getViewport().y;

    emitWheel(runtime, 100, 100, 120);

    expect(runtime.mode).toBe('sketch');
    expect(runtime.getViewport().y).toBeGreaterThan(startY);
  });

  test('enters zone-active mode on zone click', () => {
    const runtime = createRuntimeWithPdfController();

    emitClick(runtime, 100, 100);

    expect(runtime.mode).toBe('explore');
    expect(runtime.world.getActiveZone()?.id).toBe('page-1');
  });

  test('exits zone on background click and restores pre-focus viewport', () => {
    const runtime = createRuntimeWithPdfController();
    const startViewport = runtime.getViewport();

    emitClick(runtime, 100, 100);
    emitClick(runtime, 2000, 2000);

    expect(runtime.mode).toBe('sketch');
    expect(runtime.world.hasActiveZone()).toBe(false);

    const pending = runtime.transitionManager.getPendingTransition();
    expect(pending.to[1]).toBeCloseTo(startViewport.x, 3);
    expect(pending.to[2]).toBeCloseTo(startViewport.y, 3);
    expect(pending.to[3] - pending.to[1]).toBeCloseTo(startViewport.width, 3);
    expect(pending.to[4] - pending.to[2]).toBeCloseTo(startViewport.height, 3);
  });

  test('exits zone on Escape', () => {
    const runtime = createRuntimeWithPdfController();

    emitClick(runtime, 100, 100);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    runtime.world.flushSubscriptions();

    expect(runtime.world.hasActiveZone()).toBe(false);
    expect(runtime.mode).toBe('sketch');
  });

  test('stays in zone when zooming out with wheel', () => {
    const runtime = createRuntimeWithPdfController();

    emitClick(runtime, 100, 100);
    expect(runtime.world.hasActiveZone()).toBe(true);

    emitWheel(runtime, 100, 100, 120);

    expect(runtime.world.hasActiveZone()).toBe(true);
    expect(runtime.mode).toBe('explore');
  });
});
