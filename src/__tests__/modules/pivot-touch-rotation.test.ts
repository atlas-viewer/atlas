import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';
import { Box } from '../../objects/box';
import { Zone } from '../../world-objects/zone';
/** @vitest-environment happy-dom */
import { dna, DnaFactory } from '@atlas-viewer/dna';
import { Runtime } from '../../renderer/runtime';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';
import { popmotionController } from '../../modules/popmotion-controller/popmotion-controller';
import { BrowserEventManager } from '../../modules/browser-event-manager/browser-event-manager';

function setup(enableTouchRotation = true, width = 200, height = 200, touchRotationSnap = 0) {
  const element = document.createElement('canvas');
  document.body.append(element);
  const bounds = { x: 30, y: 40, left: 30, top: 40, width, height };
  element.getBoundingClientRect = () => bounds as DOMRect;
  const world = new World(1000, 1000);
  const owner = WorldObject.createWithProps({ id: 'page', x: 0, y: 0, width: 1000, height: 1000 });
  const nested = WorldObject.createWithProps({ id: 'nested', x: 100, y: 100, width: 200, height: 200 });
  owner.appendChild(nested as any);
  world.appendChild(owner);
  const context: any = {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
  };
  element.width = width;
  element.height = height;
  element.getContext = vi.fn(() => context);
  const renderer = new CanvasRenderer(element, { box: true });
  const runtime = new Runtime(renderer, world, { x: 100, y: 100, width, height, scale: 1 }, []);
  runtime.stop();
  runtime.target.set(dna([1, 100, 100, 100 + width, 100 + height]));
  const stop = popmotionController({ parentElement: element, enableTouchRotation, touchRotationSnap }).start(runtime);
  const events = new BrowserEventManager(element, runtime);
  function touch(type: string, points: Array<[number, number, number]>) {
    const touches: any = points.map(([identifier, x, y]) => ({ identifier, clientX: x + 30, clientY: y + 40 }));
    touches.item = (i: number) => touches[i];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { touches });
    element.dispatchEvent(event);
    return event;
  }
  function frame() {
    runtime.transitionManager.runTransition(runtime.target, 1000);
  }
  function project(object: WorldObject, x: number, y: number) {
    return runtime.worldToViewer(x, y, 0, 0);
  }
  return {
    runtime,
    world,
    owner,
    nested,
    renderer,
    context,
    touch,
    frame,
    project,
    cleanup() {
      stop();
      events.stop();
      runtime.stop();
      renderer.reset();
      element.remove();
    },
  };
}

test('two fingers anchor content through simultaneous pan, zoom and rotation, independent of frame timing', () => {
  const h = setup();
  try {
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    // Midpoint moves (60,60)->(100,90), distance doubles, angle turns 90 degrees.
    expect(
      h.touch('touchmove', [
        [1, 100, 50],
        [2, 100, 130],
      ]).defaultPrevented
    ).toBe(true);
    // A second event arrives before rendering; reverse list order to test touch identifiers.
    h.touch('touchmove', [
      [2, 120, 150],
      [1, 120, 70],
    ]);
    h.frame();
    expect(h.runtime.viewRotation).toBeCloseTo(90);
    expect(h.owner.rotation).toBe(0);
    expect(h.nested.rotation).toBe(0);
    expect(h.project(h.owner, 140, 160)).toMatchObject({ x: 120, y: 70 });
    expect(h.project(h.owner, 180, 160)).toMatchObject({ x: 120, y: 150 });
    h.touch('touchmove', [
      [1, 130, 80],
      [2, 130, 160],
    ]);
    h.frame();
    expect(h.project(h.owner, 140, 160)).toMatchObject({ x: 130, y: 80 });
    h.touch('touchend', [[2, 130, 160]]);
    expect(h.runtime.isInteracting).toBe(false);
    const target = Array.from(h.runtime.transitionManager.getPendingTransition().to);
    h.touch('touchmove', [[2, 140, 170]]);
    expect(Array.from(h.runtime.transitionManager.getPendingTransition().to)).toEqual(target);
  } finally {
    h.cleanup();
  }
});

test('rotation is disabled by default and touch cancellation releases the pivot', () => {
  for (const enabled of [false, true]) {
    const h = setup(enabled);
    try {
      h.touch('touchstart', [
        [1, 40, 60],
        [2, 80, 60],
      ]);
      h.touch('touchmove', [
        [1, 60, 40],
        [2, 60, 80],
      ]);
      expect(h.runtime.viewRotation).toBeCloseTo(enabled ? 90 : 0);
      h.touch('touchcancel', []);
      expect(h.runtime.isInteracting).toBe(false);
    } finally {
      h.cleanup();
    }
  }
});

test('imperative rotation preserves an arbitrary pivot, supports consecutive pivots and rejects invalid input', () => {
  const h = setup();
  try {
    h.runtime.rotateBy(90, { x: 160, y: 160 });
    expect(h.project(h.owner, 160, 160)).toMatchObject({ x: 60, y: 60 });
    expect(h.project(h.owner, 180, 160)).toMatchObject({ x: 60, y: 80 });
    // Re-anchoring must not change the previously rendered position by itself.
    const before = h.project(h.owner, h.owner.x + 180, h.owner.y + 160);
    h.runtime.rotateBy(0, { x: 200, y: 200 });
    const after = h.project(h.owner, h.owner.x + 180, h.owner.y + 160);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(() => h.runtime.rotateBy(NaN)).toThrow(RangeError);
    expect(() => h.runtime.rotateBy(10, { x: Infinity, y: 0 })).toThrow(RangeError);
  } finally {
    h.cleanup();
  }
});

test('nested object geometry and its own rotation survive view gestures and release', () => {
  const h = setup();
  try {
    h.nested.rotation = -90;
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    h.touch('touchmove', [
      [1, 60, 40],
      [2, 60, 80],
    ]);
    h.frame();
    const before = { x: h.owner.x + h.nested.x, y: h.owner.y + h.nested.y };
    expect(h.nested.rotation).toBe(-90);
    h.touch('touchend', []);
    h.frame();
    h.runtime.render(performance.now() + 1000);
    expect(h.owner.x + h.nested.x).toBeCloseTo(before.x);
    expect(h.owner.y + h.nested.y).toBeCloseTo(before.y);
  } finally {
    h.cleanup();
  }
});

test.each([0, 30, 45, 90, 135, 270])(
  'all image corners remain reachable after zoomed-in constraint at %s degrees',
  (degrees) => {
    const h = setup(true, 200, 100);
    try {
      h.runtime.viewRotation = degrees;
      for (const [x, y] of [
        [0, 0],
        [1000, 0],
        [0, 1000],
        [1000, 1000],
      ]) {
        h.runtime.target.set(DnaFactory.singleBox(200, 100, x - 100, y - 50));
        h.runtime.constrainBounds(h.runtime.target, { ref: true });
        const point = h.runtime.worldToViewer(x, y, 0, 0);
        expect(point.x).toBeGreaterThanOrEqual(-0.001);
        expect(point.y).toBeGreaterThanOrEqual(-0.001);
        expect(point.x).toBeLessThanOrEqual(200.001);
        expect(point.y).toBeLessThanOrEqual(100.001);
        expect(h.runtime.constrainBounds(h.runtime.target)[0]).toBe(false);
      }
    } finally {
      h.cleanup();
    }
  }
);

test.each([45, 90])('zone corners remain reachable after animated snap-back at %s degrees', (degrees) => {
  const h = setup(true, 200, 100);
  try {
    h.world.addZone(new Zone({ id: 'page-zone', x: 300, y: 200, width: 400, height: 300, objects: [h.owner] }));
    h.runtime.selectZone('page-zone');
    h.runtime.viewRotation = degrees;
    for (const [x, y] of [
      [300, 200],
      [700, 200],
      [300, 500],
      [700, 500],
    ]) {
      h.runtime.target.set(DnaFactory.singleBox(200, 100, x - 100, y - 50));
      h.runtime.transitionManager.constrainBounds();
      h.frame();
      const point = h.runtime.worldToViewer(x, y, 0, 0);
      expect(point.x).toBeGreaterThanOrEqual(-0.001);
      expect(point.y).toBeGreaterThanOrEqual(-0.001);
      expect(point.x).toBeLessThanOrEqual(200.001);
      expect(point.y).toBeLessThanOrEqual(100.001);
      expect(h.runtime.constrainBounds(h.runtime.target)[0]).toBe(false);
    }
  } finally {
    h.cleanup();
  }
});

test('view rotation leaves geometry untouched, selects newly visible content and reaches the real canvas transform', () => {
  const h = setup(true, 200, 100);
  try {
    const box = new Box();
    box.applyProps({
      id: 'marker',
      target: { x: 190, y: 60, width: 10, height: 10 },
      style: { backgroundColor: 'red' },
    });
    h.owner.appendChild(box);
    const before = [
      Array.from(h.owner.points),
      Array.from(h.nested.points),
      Array.from(box.points),
      h.world.width,
      h.world.height,
    ];
    h.runtime.viewRotation = 90;
    h.context.fillRect.mockClear();
    h.runtime.render(performance.now() + 100);
    expect(h.context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    // Outside the original y=100..200 target, visible in the rotated y=50..250 footprint.
    expect(h.context.fillRect.mock.calls.some((call: number[]) => call[0] === 90 && call[1] === -40)).toBe(true);
    expect([
      Array.from(h.owner.points),
      Array.from(h.nested.points),
      Array.from(box.points),
      h.world.width,
      h.world.height,
    ]).toEqual(before);
    expect(h.owner.rotation).toBe(0);
    expect(h.owner.rotationPivot).toBeUndefined();
    const screen = h.runtime.worldToViewer(195, 65, 0, 0);
    const world = h.runtime.viewerToWorld(screen.x, screen.y);
    expect(world.x).toBeCloseTo(195);
    expect(world.y).toBeCloseTo(65);
    expect(h.world.getObjectsAt(DnaFactory.singleBox(1, 1, world.x, world.y), true)[0][1]).toContain(box);
  } finally {
    h.cleanup();
  }
});

test.each([0, 45, 90])('home fits a non-square world at %s degrees', (degrees) => {
  const h = setup(true, 200, 100);
  try {
    h.runtime.setHomePosition({ x: 0, y: 0, width: 1000, height: 400 });
    h.runtime.viewRotation = degrees;
    const home = h.runtime.getHomeTarget();
    h.runtime.target.set(DnaFactory.singleBox(home.width, home.height, home.x, home.y));
    for (const [x, y] of [
      [0, 0],
      [1000, 0],
      [0, 400],
      [1000, 400],
    ]) {
      const point = h.runtime.worldToViewer(x, y, 0, 0);
      expect(point.x).toBeGreaterThanOrEqual(-0.001);
      expect(point.y).toBeGreaterThanOrEqual(-0.001);
      expect(point.x).toBeLessThanOrEqual(200.001);
      expect(point.y).toBeLessThanOrEqual(100.001);
    }
  } finally {
    h.cleanup();
  }
});

test('home padding stays in screen axes when rotated', () => {
  const h = setup(true, 200, 100);
  try {
    h.runtime.setHomePosition({ x: 0, y: 0, width: 1000, height: 400 });
    h.runtime.viewRotation = 45;
    const home = h.runtime.getHomeTarget({ paddingPx: { left: 40, right: 10, top: 5, bottom: 20 } });
    h.runtime.target.set(DnaFactory.singleBox(home.width, home.height, home.x, home.y));
    for (const [x, y] of [
      [0, 0],
      [1000, 0],
      [0, 400],
      [1000, 400],
    ]) {
      const point = h.runtime.worldToViewer(x, y, 0, 0);
      expect(point.x).toBeGreaterThanOrEqual(39.999);
      expect(point.y).toBeGreaterThanOrEqual(4.999);
      expect(point.x).toBeLessThanOrEqual(190.001);
      expect(point.y).toBeLessThanOrEqual(80.001);
    }
  } finally {
    h.cleanup();
  }
});

test.each([
  [90, 70, 90],
  [15, 23, 30],
  [90, -70, -90],
  [90, 179, 180],
  [0, 23, 23],
])('touch release snaps by %s degrees from %s to %s, preserving the final midpoint', (interval, angle, expected) => {
  const h = setup(true, 200, 200, interval);
  try {
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    const dx = 20 * Math.cos((angle * Math.PI) / 180),
      dy = 20 * Math.sin((angle * Math.PI) / 180);
    h.touch('touchmove', [
      [1, 100 - dx, 90 - dy],
      [2, 100 + dx, 90 + dy],
    ]);
    expect(h.runtime.viewRotation).toBeCloseTo(angle);
    // No animation frame between the last move and release.
    h.touch('touchend', []);
    h.frame();
    expect(h.runtime.viewRotation).toBeCloseTo(expected);
    const pivot = h.runtime.worldToViewer(160, 160, 0, 0);
    expect(pivot.x).toBeCloseTo(100, 3);
    expect(pivot.y).toBeCloseTo(90, 3);
    expect(h.owner.rotation).toBe(0);
  } finally {
    h.cleanup();
  }
});

test('cancelling a gesture does not snap, and invalid snap intervals are rejected', () => {
  const h = setup(true, 200, 200, 90);
  try {
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    h.touch('touchmove', [
      [1, 40, 40],
      [2, 80, 80],
    ]);
    h.touch('touchcancel', []);
    expect(h.runtime.viewRotation).toBeCloseTo(45);
    for (const interval of [-1, NaN, Infinity, 361]) {
      expect(() => popmotionController({ touchRotationSnap: interval })).toThrow(RangeError);
    }
  } finally {
    h.cleanup();
  }
});

test('snap animates around the touch pivot and a new gesture interrupts at the current angle', () => {
  const h = setup(true, 200, 200, 90);
  try {
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    const dx = 20 * Math.cos((70 * Math.PI) / 180),
      dy = 20 * Math.sin((70 * Math.PI) / 180);
    h.touch('touchmove', [
      [1, 100 - dx, 90 - dy],
      [2, 100 + dx, 90 + dy],
    ]);
    h.touch('touchend', []);
    expect(h.runtime.viewRotation).toBeCloseTo(70);
    expect(h.runtime.transitionManager.hasPending()).toBe(true);
    h.runtime.transitionManager.runTransition(h.runtime.target, 125);
    expect(h.runtime.viewRotation).toBeGreaterThan(70);
    expect(h.runtime.viewRotation).toBeLessThan(90);
    const pivot = h.runtime.worldToViewer(160, 160, 0, 0);
    expect(pivot.x).toBeCloseTo(100, 3);
    expect(pivot.y).toBeCloseTo(90, 3);
    const angle = h.runtime.viewRotation;
    h.touch('touchstart', [
      [1, 50, 50],
      [2, 100, 50],
    ]);
    expect(h.runtime.transitionManager.hasPending()).toBe(false);
    h.frame();
    expect(h.runtime.viewRotation).toBe(angle);
  } finally {
    h.cleanup();
  }
});

test('rotation transitions cross zero on the shortest arc without changing scene geometry', () => {
  const h = setup();
  try {
    h.runtime.viewRotation = 350;
    h.runtime.transitionManager.rotateTo(0);
    h.runtime.transitionManager.runTransition(h.runtime.target, 125);
    expect(h.runtime.viewRotation).toBeGreaterThan(350);
    h.frame();
    expect(h.runtime.viewRotation).toBe(0);
    expect(h.owner.rotation).toBe(0);
    expect(h.owner.x).toBe(0);
    expect(h.owner.y).toBe(0);
  } finally {
    h.cleanup();
  }
});

test('world rotation controls accumulate quarter turns while animating', () => {
  const h = setup(false);
  try {
    h.world.rotateBy();
    h.world.flushSubscriptions();
    expect(h.runtime.transitionManager.getPendingTransition().rotation?.to).toBe(90);
    h.runtime.transitionManager.runTransition(h.runtime.target, 100);
    h.world.rotateBy(90);
    h.world.flushSubscriptions();
    expect(h.runtime.transitionManager.getPendingTransition().rotation?.to).toBe(180);
    h.frame();
    expect(h.runtime.viewRotation).toBe(180);
    h.world.rotateBy(-90, undefined, true);
    h.world.flushSubscriptions();
    h.runtime.transitionManager.runTransition(h.runtime.target, 0);
    expect(h.runtime.viewRotation).toBe(90);
    expect(h.owner.rotation).toBe(0);
  } finally {
    h.cleanup();
  }
});

test('touch rotation can be enabled and disabled without restarting the controller', () => {
  const h = setup(false, 200, 200, 90);
  try {
    expect(h.runtime.touchRotationEnabled).toBe(false);
    h.runtime.setTouchRotationEnabled(true);
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    h.touch('touchmove', [
      [1, 40, 40],
      [2, 80, 80],
    ]);
    expect(h.runtime.viewRotation).toBeCloseTo(45);
    h.runtime.setTouchRotationEnabled(false);
    h.touch('touchmove', [
      [1, 80, 60],
      [2, 80, 140],
    ]);
    h.frame();
    expect(h.runtime.viewRotation).toBeCloseTo(45);
    const pivot = h.runtime.worldToViewer(160, 160, 0, 0);
    expect(pivot.x).toBeCloseTo(80, 3);
    expect(pivot.y).toBeCloseTo(100, 3);
    h.touch('touchend', []);
    h.frame();
    expect(h.runtime.viewRotation).toBeCloseTo(45);
    h.runtime.setTouchRotationEnabled(true);
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    h.touch('touchmove', [
      [1, 40, 40],
      [2, 80, 80],
    ]);
    expect(h.runtime.viewRotation).toBeCloseTo(90);
  } finally {
    h.cleanup();
  }
});

test('disabling touch rotation interrupts an active snap without resetting its angle', () => {
  const h = setup(true, 200, 200, 90);
  try {
    h.touch('touchstart', [
      [1, 40, 60],
      [2, 80, 60],
    ]);
    h.touch('touchmove', [
      [1, 40, 40],
      [2, 80, 80],
    ]);
    h.touch('touchend', []);
    h.runtime.transitionManager.runTransition(h.runtime.target, 100);
    const angle = h.runtime.viewRotation;
    h.runtime.setTouchRotationEnabled(false);
    expect(h.runtime.transitionManager.hasPending()).toBe(false);
    h.frame();
    expect(h.runtime.viewRotation).toBe(angle);
  } finally {
    h.cleanup();
  }
});
