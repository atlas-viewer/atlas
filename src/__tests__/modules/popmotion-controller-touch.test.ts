/** @vitest-environment happy-dom */

import { dna } from '@atlas-viewer/dna';
import {
  type PopmotionControllerConfig,
  popmotionController,
} from '../../modules/popmotion-controller/popmotion-controller';

type WorldListener = (event: any) => void;
type LayoutListener = (type: string, data?: any) => void;

function createTouchList(touches: Array<{ id: number; clientX: number; clientY: number }>) {
  const list: any = touches.map((touch) => ({
    identifier: touch.id,
    clientX: touch.clientX,
    clientY: touch.clientY,
  }));
  list.item = (index: number) => list[index] ?? null;
  return list;
}

function createTouchEvent(touches: Array<{ id: number; clientX: number; clientY: number }>) {
  const touchList = createTouchList(touches);
  return {
    touches: touchList,
    atlasTouches: touches.map((touch) => ({ id: touch.id, x: touch.clientX, y: touch.clientY })),
    preventDefault: vi.fn(),
  };
}

function createParentElement() {
  const listeners = new Map<string, Set<(event: any) => void>>();

  return {
    dataset: {} as Record<string, string | undefined>,
    addEventListener(eventName: string, handler: (event: any) => void) {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName)!.add(handler);
    },
    removeEventListener(eventName: string, handler: (event: any) => void) {
      listeners.get(eventName)?.delete(handler);
    },
    emit(eventName: string, payload: any) {
      const handlers = listeners.get(eventName);
      if (!handlers) {
        return;
      }
      for (const handler of handlers) {
        handler(payload);
      }
    },
  };
}

function createTouchHarness(config: PopmotionControllerConfig = {}) {
  const worldListeners = new Map<string, Set<WorldListener>>();
  const layoutListeners = new Set<LayoutListener>();
  const parentElement = createParentElement();

  const world = {
    activatedEvents: [] as string[],
    addEventListener(eventName: string, handler: WorldListener) {
      if (!worldListeners.has(eventName)) {
        worldListeners.set(eventName, new Set());
      }
      worldListeners.get(eventName)!.add(handler);
    },
    removeEventListener(eventName: string, handler: WorldListener) {
      worldListeners.get(eventName)?.delete(handler);
    },
    addLayoutSubscriber(listener: LayoutListener) {
      layoutListeners.add(listener);
      return () => {
        layoutListeners.delete(listener);
      };
    },
    constraintBounds: vi.fn((immediate?: boolean) => {
      for (const listener of layoutListeners) {
        listener('constrain-bounds', { immediate });
      }
    }),
    zoomIn: vi.fn(),
    zoomTo: vi.fn(),
  };

  const target = dna([1, 0, 0, 100, 100]);
  const pendingTransition = {
    from: dna(target),
    to: dna(target),
    elapsed_time: 0,
    total_time: 0,
    timingFunction: (t: number) => t,
    done: true,
    constrain: false,
    callback: undefined as undefined | (() => void),
  };

  const runtime: any = {
    mode: 'explore',
    world,
    target,
    getRendererScreenPosition: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    viewerToWorld: (x: number, y: number) => ({ x, y }),
    getScaleFactor: () => 1,
    registerHook: () => () => undefined,
    updateNextFrame: vi.fn(),
    constrainBounds: (nextTarget: any) => [false, nextTarget] as const,
    getHomeTarget: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  };

  runtime.transitionManager = {
    stopTransition: vi.fn(),
    getPendingTransition: vi.fn(() => pendingTransition),
    customTransition: vi.fn((applyTransition: any) => {
      applyTransition(pendingTransition);
    }),
    constrainBounds: vi.fn(),
    constrainTarget: vi.fn(),
    zoomTo: vi.fn(),
    goToRegion: vi.fn(),
  };

  const controller = popmotionController({
    parentElement: parentElement as any,
    ...config,
  });
  const stop = controller.start(runtime);

  return {
    runtime,
    world,
    pendingTransition,
    parentElement,
    stop,
    emitWorld(eventName: string, payload: any) {
      const handlers = worldListeners.get(eventName);
      if (!handlers) {
        return;
      }
      for (const handler of handlers) {
        handler(payload);
      }
    },
  };
}

describe('popmotion controller touch gestures', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('pinch overshoot remains unconstrained during the live gesture', () => {
    const harness = createTouchHarness();

    harness.emitWorld(
      'touchstart',
      createTouchEvent([
        { id: 1, clientX: 0, clientY: 0 },
        { id: 2, clientX: 100, clientY: 100 },
      ])
    );
    harness.parentElement.emit(
      'touchmove',
      createTouchEvent([
        { id: 1, clientX: 25, clientY: 25 },
        { id: 2, clientX: 75, clientY: 75 },
      ])
    );

    expect(harness.pendingTransition.to[1]).toBe(-50);
    expect(harness.pendingTransition.to[2]).toBe(-50);
    expect(harness.pendingTransition.to[3]).toBe(150);
    expect(harness.pendingTransition.to[4]).toBe(150);
    expect(harness.runtime.transitionManager.constrainTarget).not.toHaveBeenCalled();

    harness.stop();
  });

  test('pinch release on first finger up constrains the latest gesture target', () => {
    const harness = createTouchHarness();

    harness.emitWorld(
      'touchstart',
      createTouchEvent([
        { id: 1, clientX: 0, clientY: 0 },
        { id: 2, clientX: 100, clientY: 100 },
      ])
    );
    harness.parentElement.emit(
      'touchmove',
      createTouchEvent([
        { id: 1, clientX: 25, clientY: 25 },
        { id: 2, clientX: 75, clientY: 75 },
      ])
    );
    harness.emitWorld('touchend', createTouchEvent([{ id: 2, clientX: 75, clientY: 75 }]));

    expect(harness.world.constraintBounds).not.toHaveBeenCalled();
    expect(harness.runtime.transitionManager.constrainTarget).toHaveBeenCalledTimes(1);

    const [sourceTarget, options] = harness.runtime.transitionManager.constrainTarget.mock.calls[0];
    expect(sourceTarget[1]).toBe(-50);
    expect(sourceTarget[2]).toBe(-50);
    expect(sourceTarget[3]).toBe(150);
    expect(sourceTarget[4]).toBe(150);
    expect(harness.runtime.target[1]).toBe(0);
    expect(options.origin).toEqual({ x: 50, y: 50 });

    harness.stop();
  });

  test('touchcancel settles pinch gestures through the same constrain path', () => {
    const harness = createTouchHarness();

    harness.emitWorld(
      'touchstart',
      createTouchEvent([
        { id: 1, clientX: 0, clientY: 0 },
        { id: 2, clientX: 100, clientY: 100 },
      ])
    );
    harness.parentElement.emit(
      'touchmove',
      createTouchEvent([
        { id: 1, clientX: 25, clientY: 25 },
        { id: 2, clientX: 75, clientY: 75 },
      ])
    );
    harness.emitWorld('touchcancel', createTouchEvent([]));

    expect(harness.runtime.transitionManager.constrainTarget).toHaveBeenCalledTimes(1);
    expect(harness.world.constraintBounds).not.toHaveBeenCalled();

    harness.stop();
  });

  test('single-finger touch release keeps the pan constraint path', () => {
    const harness = createTouchHarness({ enablePanMomentum: false });

    harness.emitWorld('touchstart', createTouchEvent([{ id: 1, clientX: 50, clientY: 50 }]));
    harness.parentElement.emit('touchmove', createTouchEvent([{ id: 1, clientX: 40, clientY: 50 }]));
    harness.emitWorld('touchend', createTouchEvent([]));

    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(1);
    expect(harness.runtime.transitionManager.constrainTarget).not.toHaveBeenCalled();

    harness.stop();
  });

  test('double tap zooms in by default', () => {
    const harness = createTouchHarness({ enableClickToZoom: false });

    now = 10;
    harness.emitWorld('touchstart', createTouchEvent([{ id: 1, clientX: 50, clientY: 50 }]));
    now = 30;
    harness.emitWorld('touchend', createTouchEvent([]));

    now = 120;
    harness.emitWorld('touchstart', createTouchEvent([{ id: 1, clientX: 52, clientY: 52 }]));
    now = 140;
    harness.emitWorld('touchend', createTouchEvent([]));

    expect(harness.runtime.world.zoomIn).toHaveBeenCalledTimes(1);
    expect(harness.runtime.world.zoomIn).toHaveBeenCalledWith({ x: 52, y: 52 });

    harness.stop();
  });
});
