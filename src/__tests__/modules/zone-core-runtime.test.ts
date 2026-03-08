/** @vitest-environment happy-dom */

import type { Strand } from '@atlas-viewer/dna';
import { DnaFactory } from '@atlas-viewer/dna';
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

function createWorldObject(props: { id: string; x: number; y: number; width: number; height: number }) {
  const object = new WorldObject();
  object.applyProps(props);
  return object;
}

describe('zone core and runtime zone navigation', () => {
  test('active zone index 0 is valid', () => {
    const world = new World(1000, 1000);
    const objectA = createWorldObject({
      id: 'a',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const objectB = createWorldObject({
      id: 'b',
      x: 200,
      y: 200,
      width: 100,
      height: 100,
    });

    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        objects: [objectA],
      })
    );
    world.addZone(
      new Zone({
        id: 'zone-b',
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        objects: [objectB],
      })
    );

    world.selectZone(0);

    expect(world.hasActiveZone()).toBe(true);
    expect(world.getActiveZone()?.id).toBe('zone-a');
  });

  test('deselect emits zone-changed and clears active state', () => {
    const world = new World(1000, 1000);
    const objectA = createWorldObject({
      id: 'a',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        objects: [objectA],
      })
    );
    const layoutEvents: string[] = [];

    world.addLayoutSubscriber((type) => {
      layoutEvents.push(type);
    });

    world.selectZone('zone-a');
    world.flushSubscriptions();
    world.deselectZone();
    world.flushSubscriptions();

    expect(layoutEvents.filter((type) => type === 'zone-changed')).toHaveLength(2);
    expect(world.hasActiveZone()).toBe(false);
  });

  test('hasZone and getZoneById helpers work', () => {
    const world = new World(1000, 1000);
    const objectA = createWorldObject({
      id: 'a',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        objects: [objectA],
      })
    );

    expect(world.hasZone('zone-a')).toBe(true);
    expect(world.hasZone('missing')).toBe(false);
    expect(world.getZoneById('zone-a')?.id).toBe('zone-a');
    expect(world.getZoneById('missing')).toBeUndefined();
  });

  test('runtime.getZoneRuntimeState reports existence, active state, and viewport visibility', () => {
    const world = new World(1000, 2000);
    const object = createWorldObject({
      id: 'zone-a-object',
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    });
    world.appendChild(object);
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        objects: [object],
      })
    );

    const runtime = new Runtime(new MockRenderer(), world, {
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      scale: 1,
    });
    runtime.stop();

    expect(runtime.getZoneRuntimeState('zone-a')).toEqual({
      zoneId: 'zone-a',
      exists: true,
      active: false,
      visibleInViewport: true,
    });

    runtime.selectZone('zone-a');
    expect(runtime.getZoneRuntimeState('zone-a').active).toBe(true);

    runtime.setViewport({ x: 800, y: 800, width: 300, height: 300 });
    expect(runtime.getZoneRuntimeState('zone-a').visibleInViewport).toBe(false);

    expect(runtime.getZoneRuntimeState('missing-zone')).toEqual({
      zoneId: 'missing-zone',
      exists: false,
      active: false,
      visibleInViewport: false,
    });
  });

  test('runtime.goToZone returns true and starts a transition for existing zones', () => {
    const world = new World(1000, 2000);
    const object = createWorldObject({
      id: 'page-1-object',
      x: 0,
      y: 0,
      width: 1000,
      height: 1200,
    });
    world.appendChild(object);
    world.addZone(
      new Zone({
        id: 'page-1',
        x: 0,
        y: 0,
        width: 1000,
        height: 1200,
        objects: [object],
      })
    );

    const runtime = new Runtime(new MockRenderer(), world, {
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      scale: 1,
    });
    runtime.stop();

    const didNavigate = runtime.goToZone('page-1');

    expect(didNavigate).toBe(true);
    expect(world.getActiveZone()?.id).toBe('page-1');
    expect(runtime.transitionManager.getPendingTransition().done).toBe(false);
  });

  test('runtime.getBounds uses correct axis math when constrained to a zone', () => {
    const world = new World(1000, 2000);
    const object = createWorldObject({
      id: 'z-object',
      x: 100,
      y: 200,
      width: 300,
      height: 400,
    });
    world.appendChild(object);
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 100,
        y: 200,
        width: 300,
        height: 400,
        objects: [object],
      })
    );

    const runtime = new Runtime(new MockRenderer(), world, {
      x: 120,
      y: 220,
      width: 100,
      height: 100,
      scale: 1,
    });
    runtime.stop();

    runtime.selectZone('zone-a');
    const bounds = runtime.getBounds({ padding: 0 });

    expect(bounds.minX).toBe(100);
    expect(bounds.maxX).toBe(300);
    expect(bounds.minY).toBe(200);
    expect(bounds.maxY).toBe(500);
  });

  test('zone manual bounds override object-derived bounds', () => {
    const world = new World(1000, 1000);
    const object = createWorldObject({
      id: 'z-object',
      x: 100,
      y: 100,
      width: 400,
      height: 400,
    });
    world.appendChild(object);
    world.addZone(
      new Zone({
        id: 'zone-manual',
        x: 10,
        y: 20,
        width: 80,
        height: 60,
        margin: 5,
        objects: [object],
      })
    );

    const zone = world.getZoneById('zone-manual');
    expect(zone).toBeDefined();
    expect(zone!.points[1]).toBe(5);
    expect(zone!.points[2]).toBe(15);
    expect(zone!.points[3]).toBe(95);
    expect(zone!.points[4]).toBe(85);
  });

  test('runtime zone zoom constrains without extra global pan padding', () => {
    const world = new World(1000, 1000);
    const object = createWorldObject({
      id: 'z-object',
      x: 100,
      y: 100,
      width: 400,
      height: 400,
    });
    world.appendChild(object);
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 100,
        y: 100,
        width: 400,
        height: 400,
        objects: [object],
      })
    );

    const runtime = new Runtime(new MockRenderer(), world, {
      x: 150,
      y: 150,
      width: 100,
      height: 100,
      scale: 1,
    });
    runtime.stop();

    runtime.selectZone('zone-a');
    const zoomed = runtime.getZoomedPosition(2, {});

    expect(zoomed[1]).toBeGreaterThanOrEqual(100);
    expect(zoomed[2]).toBeGreaterThanOrEqual(100);
  });

  test('runtime.goToZone returns false for unknown zones', () => {
    const runtime = new Runtime(new MockRenderer(), new World(1000, 1000), {
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      scale: 1,
    });
    runtime.stop();

    const didNavigate = runtime.goToZone('missing-zone');

    expect(didNavigate).toBe(false);
    expect(runtime.world.hasActiveZone()).toBe(false);
  });

  test('zone selection fades outside objects then keeps them dimmed', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const world = new World(1000, 1000);
    const objectA = createWorldObject({
      id: 'a',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const objectB = createWorldObject({
      id: 'b',
      x: 200,
      y: 200,
      width: 100,
      height: 100,
    });
    world.appendChild(objectA);
    world.appendChild(objectB);
    world.addZone(
      new Zone({
        id: 'zone-a',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        objects: [objectA],
      })
    );
    world.addZone(
      new Zone({
        id: 'zone-b',
        x: 200,
        y: 200,
        width: 100,
        height: 100,
        objects: [objectB],
      })
    );

    world.selectZone('zone-a');
    const target = DnaFactory.singleBox(1000, 1000, 0, 0);
    const duringFade = world.getObjectsAt(target, false, true).map(([obj]) => obj.id);
    expect(duringFade).toContain('a');
    expect(duringFade).toContain('b');

    now = world.zoneVisibilityFadeDurationMs + 1;
    const afterFade = world.getObjectsAt(target, false, true).map(([obj]) => obj.id);
    expect(afterFade).toContain('a');
    expect(afterFade).toContain('b');

    vi.restoreAllMocks();
  });
});
