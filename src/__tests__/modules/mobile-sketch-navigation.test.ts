/** @vitest-environment happy-dom */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { BrowserEventManager } from '../../modules/browser-event-manager/browser-event-manager';
import { defaultConfig, popmotionController } from '../../modules/popmotion-controller/popmotion-controller';
import { Box } from '../../objects/box';
import type { Renderer } from '../../renderer/renderer';
import { Runtime } from '../../renderer/runtime';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

function setup({
  mode = 'sketch',
  navigation = 'two-finger',
  rotation = false,
}: { mode?: 'sketch' | 'explore'; navigation?: 'two-finger' | 'none'; rotation?: boolean } = {}) {
  const element = document.createElement('canvas');
  element.style.touchAction = 'pan-y';
  let width = 200,
    height = 300;
  const bounds = () => ({ x: 20, y: 40, left: 20, top: 40, width, height } as DOMRect);
  element.getBoundingClientRect = bounds;
  const renderer: Renderer = {
    beforeFrame() {},
    afterFrame() {},
    paint() {},
    prepareLayer() {},
    finishLayer() {},
    afterPaintLayer() {},
    getScale: (w, h) => Math.min(width / w, height / h),
    getPointsAt: () => [],
    pendingUpdate: () => false,
    isReady: () => true,
    getViewportBounds: () => null,
    resize(w?: number, h?: number) {
      width = w ?? width;
      height = h ?? height;
    },
    reset() {},
    getRendererScreenPosition: bounds,
  };
  const world = new World(2000, 3000);
  const owner = WorldObject.createWithProps({ id: 'page', x: 0, y: 0, width: 2000, height: 3000 });
  const box = new Box();
  box.applyProps({ target: { x: 0, y: 0, width: 2000, height: 3000 } });
  owner.appendChild(box);
  world.appendChild(owner);
  const runtime = new Runtime(renderer, world, { x: 100, y: 100, width, height, scale: 1 }, [], { maxOverZoom: 5 });
  runtime.stop();
  runtime.mode = mode;
  runtime.setViewport({ x: 100, y: 100, width, height });
  const stop = popmotionController({
    parentElement: element,
    sketchTouchNavigation: navigation,
    enableTouchRotation: rotation,
    touchRotationSnap: 0,
    touchRotationThreshold: 0,
    enablePanMomentum: false,
    enableHoldToHome: false,
  }).start(runtime);
  const manager = new BrowserEventManager(element, runtime);
  cleanups.push(() => {
    manager.stop();
    stop();
    runtime.dispose();
  });
  function touch(type: string, points: Array<[number, number, number]>) {
    const touches: any = points.map(([identifier, x, y]) => ({ identifier, clientX: x + 20, clientY: y + 40 }));
    touches.item = (i: number) => touches[i] ?? null;
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { touches });
    element.dispatchEvent(event);
    return event;
  }
  function pointer(type: string, id = 1, x = 50, y = 60, pointerType = 'touch') {
    const event = new PointerEvent(type, { pointerId: id, pointerType, clientX: x + 20, clientY: y + 40, button: 0 });
    element.dispatchEvent(event);
    return event;
  }
  function frame() {
    runtime.render(runtime.lastTime + 16);
    runtime.stop();
  }
  return { element, runtime, world, box, manager, touch, pointer, frame };
}

describe('mobile sketch controller and browser event ownership', () => {
  test('second pointer cancels original tool recipients and suppresses the remaining finger until all lift', () => {
    const h = setup();
    const down = vi.fn(),
      move = vi.fn(),
      up = vi.fn(),
      cancel = vi.fn(),
      click = vi.fn();
    h.box.addEventListener('pointerdown', down);
    h.box.addEventListener('pointermove', move);
    h.box.addEventListener('pointerup', up);
    h.box.addEventListener('pointercancel', cancel);
    h.box.addEventListener('click', click);
    h.world.activatedEvents.push('onPointerDown', 'onPointerUp');
    h.pointer('pointerdown');
    h.touch('touchstart', [[1, 50, 60]]);
    expect(down).toHaveBeenCalledTimes(1);
    const before = { ...h.runtime.getViewport() };
    h.pointer('pointerdown', 2, 150, 60);
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
    ]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0]).toBeInstanceOf(PointerEvent);
    expect(cancel.mock.calls[0][0].pointerId).toBe(1);
    expect(down).toHaveBeenCalledTimes(1);
    h.touch('touchmove', [
      [1, 30, 80],
      [2, 170, 80],
    ]);
    h.frame();
    expect(h.runtime.width).toBeLessThan(before.width);
    h.pointer('pointerup', 2, 170, 80);
    h.touch('touchend', [[1, 30, 80]]);
    const afterPinch = { ...h.runtime.getViewport() };
    h.pointer('pointermove', 1, 40, 90);
    h.touch('touchmove', [[1, 40, 90]]);
    h.frame();
    expect(move).not.toHaveBeenCalled();
    h.pointer('pointerup', 1, 40, 90);
    h.touch('touchend', []);
    expect(up).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    // A fresh, fully separate touch belongs to the tool again.
    h.pointer('pointerdown', 3);
    h.touch('touchstart', [[3, 50, 60]]);
    h.pointer('pointerup', 3);
    h.touch('touchend', []);
    expect(down).toHaveBeenCalledTimes(2);
    expect(up).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(afterPinch.width).toBeLessThan(before.width);
  });

  test('touch-only tools receive cancellation once and no navigation touch events', () => {
    const h = setup();
    const start = vi.fn(),
      cancel = vi.fn(),
      move = vi.fn();
    h.box.addEventListener('touchstart', start);
    h.box.addEventListener('touchcancel', cancel);
    h.box.addEventListener('touchmove', move);
    h.touch('touchstart', [[1, 50, 60]]);
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
    ]);
    h.touch('touchmove', [
      [1, 30, 60],
      [2, 170, 60],
    ]);
    h.frame();
    expect(start).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
    expect(h.runtime.width).toBeLessThan(200);
  });

  test('default none leaves sketch touch navigation disabled', () => {
    expect(defaultConfig.sketchTouchNavigation).toBe('none');
    const h = setup({ navigation: 'none' });
    const cancel = vi.fn();
    h.box.addEventListener('pointercancel', cancel);
    h.touch('touchstart', [[1, 50, 60]]);
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
    ]);
    h.touch('touchmove', [
      [1, 30, 60],
      [2, 170, 60],
    ]);
    h.frame();
    expect(h.runtime.width).toBe(200);
    expect(cancel).not.toHaveBeenCalled();
  });

  test('Hand override pans with one finger and Draw resumes without changing mode', () => {
    const h = setup();
    const down = vi.fn();
    h.box.addEventListener('pointerdown', down);
    h.world.activatedEvents.push('onPointerDown');
    h.runtime.setSketchPanOverride(true);
    h.pointer('pointerdown');
    h.touch('touchstart', [[1, 50, 60]]);
    h.touch('touchmove', [[1, 30, 60]]);
    h.frame();
    expect(h.runtime.x).toBe(120);
    expect(down).not.toHaveBeenCalled();
    h.pointer('pointerup');
    h.touch('touchend', []);
    h.runtime.setSketchPanOverride(false);
    h.pointer('pointerdown', 2);
    h.touch('touchstart', [[2, 50, 60]]);
    h.touch('touchmove', [[2, 30, 60]]);
    h.frame();
    expect(down).toHaveBeenCalledTimes(1);
    expect(h.runtime.x).toBe(120);
    expect(h.runtime.mode).toBe('sketch');
  });

  test('a tap produces one click across pointer, touch and compatibility mouse events', () => {
    const h = setup();
    const click = vi.fn(),
      mouseDown = vi.fn();
    h.box.addEventListener('click', click);
    h.box.addEventListener('mousedown', mouseDown);
    h.pointer('pointerdown');
    expect(h.touch('touchstart', [[1, 50, 60]]).defaultPrevented).toBe(true);
    h.pointer('pointerup');
    h.touch('touchend', []);
    h.element.dispatchEvent(new MouseEvent('mousedown', { clientX: 70, clientY: 100 }));
    h.element.dispatchEvent(new MouseEvent('mouseup', { clientX: 70, clientY: 100 }));
    h.element.dispatchEvent(new MouseEvent('click', { clientX: 70, clientY: 100 }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(mouseDown).not.toHaveBeenCalled();
    expect(h.element.style.touchAction).toBe('none');
    h.runtime.mode = 'explore';
    h.frame();
    expect(h.element.style.touchAction).toBe('pan-y');
  });

  test('native cancellation reaches the initial object and prevents click and delayed drag', () => {
    vi.useFakeTimers();
    const h = setup();
    const cancel = vi.fn(),
      click = vi.fn(),
      drag = vi.fn();
    h.box.addEventListener('pointerdown', () => {});
    h.box.addEventListener('pointercancel', cancel);
    h.box.addEventListener('click', click);
    h.box.addEventListener('dragstart', drag);
    h.world.activatedEvents.push('onPointerDown');
    h.pointer('pointerdown');
    h.pointer('pointercancel', 1, 5000, 5000);
    vi.advanceTimersByTime(900);
    h.pointer('pointerup');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    expect(drag).not.toHaveBeenCalled();
  });

  test('touch cancellation clears the click and drag state even without a native pointercancel', () => {
    const h = setup();
    const cancel = vi.fn(),
      click = vi.fn();
    h.box.addEventListener('pointerdown', () => {});
    h.box.addEventListener('pointercancel', cancel);
    h.box.addEventListener('click', click);
    h.world.activatedEvents.push('onPointerDown');
    h.pointer('pointerdown');
    h.touch('touchstart', [[1, 50, 60]]);
    h.touch('touchcancel', []);
    h.pointer('pointerup');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
    expect(h.manager.pointerEventState.isPressed).toBe(false);
  });

  test.each([false, true])('three fingers navigate and can rebase to two (rotation=%s)', (rotation) => {
    const h = setup({ rotation });
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
    ]);
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
      [3, 100, 150],
    ]);
    h.touch('touchmove', [
      [1, 30, 80],
      [2, 170, 80],
      [3, 100, 150],
    ]);
    h.frame();
    expect(h.runtime.width).toBeLessThan(200);
    h.touch('touchend', [
      [2, 170, 80],
      [3, 100, 150],
    ]);
    const before = h.runtime.x;
    h.touch('touchmove', [
      [2, 180, 80],
      [3, 110, 150],
    ]);
    h.frame();
    expect(h.runtime.x).not.toBe(before);
  });

  test('explore retains one finger pan and pinch', () => {
    const h = setup({ mode: 'explore', navigation: 'none' });
    h.touch('touchstart', [[1, 50, 60]]);
    h.touch('touchmove', [[1, 30, 60]]);
    h.frame();
    expect(h.runtime.x).toBe(120);
    h.touch('touchstart', [
      [1, 30, 60],
      [2, 130, 60],
    ]);
    h.touch('touchmove', [
      [1, 10, 60],
      [2, 150, 60],
    ]);
    h.frame();
    expect(h.runtime.width).toBeLessThan(200);
  });

  test('viewport subscribers receive live sketch pan and pinch scale and unsubscribe', () => {
    const h = setup();
    const listener = vi.fn();
    const remove = h.runtime.addViewportChangeListener(listener);
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
    ]);
    h.touch('touchmove', [
      [1, 30, 80],
      [2, 170, 80],
    ]);
    h.frame();
    expect(listener).toHaveBeenCalledTimes(1);
    const first = listener.mock.calls[0][0];
    expect(first.scaleFactor).toBeCloseTo(1.4);
    expect(first.center).toEqual(h.runtime.getViewportCenter());
    h.touch('touchmove', [
      [1, 40, 90],
      [2, 180, 90],
    ]);
    h.frame();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0].center).not.toEqual(first.center);
    expect(first.viewport.width).toBeCloseTo(200 / 1.4);
    h.runtime.updateNextFrame();
    h.frame();
    expect(listener).toHaveBeenCalledTimes(2);
    remove();
    h.runtime.setViewport({ x: 400 });
    h.frame();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('zoomToRegion fits CSS padding with the existing transition and works without a controller', () => {
    const h = setup();
    const region = { x: 500, y: 800, width: 100, height: 100 };
    h.runtime.setHomePaddingPx(99);
    h.runtime.zoomToRegion(region, { padding: 20, transition: { duration: 240 } });
    expect(h.runtime.transitionManager.getPendingTransition().total_time).toBe(240);
    h.runtime.transitionManager.runTransition(h.runtime.target, 240);
    const topLeft = h.runtime.worldToViewer(region.x, region.y, 0, 0);
    const bottomRight = h.runtime.worldToViewer(region.x + region.width, region.y + region.height, 0, 0);
    expect(topLeft.x).toBeGreaterThanOrEqual(20);
    expect(topLeft.y).toBeGreaterThanOrEqual(20);
    expect(bottomRight.x).toBeLessThanOrEqual(180);
    expect(bottomRight.y).toBeLessThanOrEqual(280);
    expect(h.runtime.getViewportCenter()).toEqual({ x: 550, y: 850 });
  });

  test('an unframed pinch uses the complete transform, including when rotation is disabled', () => {
    const h = setup();
    h.touch('touchstart', [
      [1, 50, 60],
      [2, 150, 60],
    ]);
    h.touch('touchmove', [
      [1, 40, 70],
      [2, 160, 70],
    ]);
    h.touch('touchmove', [
      [1, 30, 80],
      [2, 170, 80],
    ]);
    h.frame();
    expect(h.runtime.width).toBeCloseTo(200 / 1.4);
    expect(h.runtime.getViewportCenter().x).toBeCloseTo(200);
  });

  test('pinch settles to maxOverZoom 5 and a 0.2 world-unit CSS pixel', () => {
    const h = setup();
    h.touch('touchstart', [
      [1, 90, 150],
      [2, 110, 150],
    ]);
    h.touch('touchmove', [
      [1, -100, 150],
      [2, 300, 150],
    ]);
    h.frame();
    expect(h.runtime.getScaleFactor()).toBeGreaterThan(5);
    h.touch('touchend', [[1, -100, 150]]);
    h.runtime.transitionManager.runTransition(h.runtime.target, 1000);
    expect(h.runtime.getScaleFactor()).toBeCloseTo(5);
    expect(1 / h.runtime.getScaleFactor()).toBeCloseTo(0.2);
  });

  test.each([0, 37, 90])(
    'centre and CSS scale remain observable through a portrait keyboard resize (rotation=%s)',
    (rotation) => {
      const h = setup();
      h.runtime.viewRotation = rotation;
      const center = h.runtime.getViewportCenter();
      const listener = vi.fn();
      h.runtime.addViewportChangeListener(listener);
      h.runtime.resize(200, 200, 300, 180);
      h.frame();
      expect(h.runtime.getViewportCenter().x).toBeCloseTo(center.x, 0);
      expect(h.runtime.getViewportCenter().y).toBeCloseTo(center.y, 0);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].rotation).toBe(rotation);
      expect(listener.mock.calls[0][0].scaleFactor).toBe(h.runtime.getScaleFactor());
    }
  );

  test.each([0, 37, 90])('animated zoom fits asymmetric CSS padding in a rotated view (%s)', (rotation) => {
    const h = setup();
    h.runtime.viewRotation = rotation;
    const box = { x: 600, y: 900, width: 80, height: 140 };
    h.runtime.zoomToRegion(box, { padding: { left: 12, right: 30, top: 40, bottom: 20 }, transition: { duration: 0 } });
    h.frame();
    for (const x of [box.x, box.x + box.width]) {
      for (const y of [box.y, box.y + box.height]) {
        const point = h.runtime.worldToViewer(x, y, 0, 0);
        expect(point.x).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(point.x).toBeLessThanOrEqual(170 + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(40 - 1e-6);
        expect(point.y).toBeLessThanOrEqual(280 + 1e-6);
      }
    }
  });
});

 test.each([0, 37, 90])('mirrored pinches preserve the midpoint anchor at rotation %s', (rotation) => {
  const h = setup();
  h.runtime.viewFlip = true;
  h.runtime.viewRotation = rotation;
  const anchor = h.runtime.viewerToWorld(70, 100);
  h.touch('touchstart', [[1, 40, 100], [2, 100, 100]]);
  h.touch('touchmove', [[1, 20, 100], [2, 120, 100]]);
  h.frame();
  const after = h.runtime.viewerToWorld(70, 100);
  expect(after.x).toBeCloseTo(anchor.x);
  expect(after.y).toBeCloseTo(anchor.y);
});

test('mirrored rotation follows the fingers in screen space', () => {
  const h = setup({ rotation: true });
  h.runtime.viewFlip = true;
  h.touch('touchstart', [[1, 50, 100], [2, 150, 100]]);
  h.touch('touchmove', [[1, 100, 50], [2, 100, 150]]);
  h.frame();
  expect(h.runtime.viewRotation).toBeCloseTo(-90);
});
