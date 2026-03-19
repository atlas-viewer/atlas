import { dna } from '@atlas-viewer/dna';
import {
  defaultConfig,
  type PopmotionControllerConfig,
  popmotionController,
} from '../../modules/popmotion-controller/popmotion-controller';

type WorldListener = (event: any) => void;
type LayoutListener = (type: string, data?: any) => void;

function createRuntimeHarness(config: PopmotionControllerConfig = {}) {
  const worldListeners = new Map<string, Set<WorldListener>>();
  const layoutListeners = new Set<LayoutListener>();
  const hookListeners = {
    useFrame: new Set<(delta: number) => void>(),
  };

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
    goHome: vi.fn((immediate?: boolean, paddingPx?: number) => {
      for (const listener of layoutListeners) {
        listener('go-home', { immediate, paddingPx });
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
    registerHook: (name: 'useFrame', listener: (delta: number) => void) => {
      hookListeners[name].add(listener);
      return () => {
        hookListeners[name].delete(listener);
      };
    },
    updateNextFrame: vi.fn(),
    constrainBounds: (nextTarget: any) => [false, nextTarget] as const,
    getHomeTarget: () => ({ x: 0, y: 0, width: 100, height: 100 }),
  };

  runtime.transitionManager = {
    stopTransition: vi.fn(),
    customTransition: vi.fn((applyTransition: any) => {
      applyTransition(pendingTransition);
      if (!pendingTransition.done && pendingTransition.total_time === 0) {
        target[1] = pendingTransition.to[1];
        target[2] = pendingTransition.to[2];
        target[3] = pendingTransition.to[3];
        target[4] = pendingTransition.to[4];
        pendingTransition.done = true;
      }
    }),
    constrainBounds: vi.fn((options: { panPadding?: number; transition?: { duration?: number; easing?: (t: number) => number } } = {}) => {
      const [isConstrained, constrained] = runtime.constrainBounds(target, { panPadding: options.panPadding });
      if (!isConstrained) {
        return;
      }
      pendingTransition.from = dna(target);
      pendingTransition.to = dna(constrained);
      pendingTransition.elapsed_time = 0;
      pendingTransition.total_time = options.transition?.duration ?? 500;
      pendingTransition.timingFunction = options.transition?.easing ?? ((t: number) => t);
      pendingTransition.done = false;
      pendingTransition.constrain = false;
      pendingTransition.callback = undefined;
    }),
    zoomTo: vi.fn(),
    goToRegion: vi.fn(),
  };

  const controller = popmotionController(config);
  const stop = controller.start(runtime);

  return {
    runtime,
    world,
    pendingTransition,
    stop,
    emitWorld(eventName: string, payload: any) {
      const handlers = worldListeners.get(eventName);
      if (!handlers) return;
      for (const handler of handlers) {
        handler(payload);
      }
    },
    runFrame(delta: number) {
      for (const listener of hookListeners.useFrame) {
        listener(delta);
      }
      if (!pendingTransition.done) {
        const td =
          pendingTransition.total_time === 0
            ? 1
            : (pendingTransition.elapsed_time + delta) / pendingTransition.total_time;
        const step = pendingTransition.total_time === 0 ? 1 : td === 0 ? 0 : pendingTransition.timingFunction(td);

        target[1] = pendingTransition.from[1] + (pendingTransition.to[1] - pendingTransition.from[1]) * step;
        target[2] = pendingTransition.from[2] + (pendingTransition.to[2] - pendingTransition.from[2]) * step;
        target[3] = pendingTransition.from[3] + (pendingTransition.to[3] - pendingTransition.from[3]) * step;
        target[4] = pendingTransition.from[4] + (pendingTransition.to[4] - pendingTransition.from[4]) * step;

        pendingTransition.elapsed_time += delta;
        if (pendingTransition.total_time === 0 || pendingTransition.elapsed_time >= pendingTransition.total_time) {
          pendingTransition.done = true;
          pendingTransition.callback?.();
        }
      }
    },
  };
}

function emitClick(
  harness: ReturnType<typeof createRuntimeHarness>,
  point: { x: number; y: number }
) {
  harness.emitWorld('click', {
    atlas: point,
  });
}

function emitMouseClickCycle(
  harness: ReturnType<typeof createRuntimeHarness>,
  point: { x: number; y: number }
) {
  harness.emitWorld('mousedown', {
    which: 1,
    atlas: point,
    clientX: point.x,
    clientY: point.y,
    preventDefault: vi.fn(),
  });
  emitClick(harness, point);
  harness.emitWorld('mouseup', {});
}

function dragForMomentum(
  harness: ReturnType<typeof createRuntimeHarness>,
  setNow: (value: number) => void,
  {
    startX = 50,
    startY = 50,
    midX = 40,
    endX = 20,
  }: { startX?: number; startY?: number; midX?: number; endX?: number } = {}
) {
  harness.emitWorld('mousedown', {
    which: 1,
    atlas: { x: startX, y: startY },
    preventDefault: vi.fn(),
  });

  setNow(16);
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: midX, clientY: startY }));
  setNow(32);
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: endX, clientY: startY }));
  harness.emitWorld('mouseup', {});
}

function dragWithSteps(
  harness: ReturnType<typeof createRuntimeHarness>,
  setNow: (value: number) => void,
  steps: Array<{ t: number; x: number; y: number }>
) {
  if (steps.length === 0) {
    return;
  }
  const first = steps[0];
  harness.emitWorld('mousedown', {
    which: 1,
    atlas: { x: first.x, y: first.y },
    preventDefault: vi.fn(),
  });
  for (let i = 1; i < steps.length; i++) {
    setNow(steps[i].t);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: steps[i].x, clientY: steps[i].y }));
  }
  harness.emitWorld('mouseup', {});
}

describe('popmotion controller pan momentum', () => {
  let now = 0;

  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('desktop zoom defaults use double click and hold-to-home', () => {
    expect(defaultConfig.enableClickToZoom).toBe(false);
    expect(defaultConfig.enableDoubleClickZoom).toBe(true);
    expect(defaultConfig.enableHoldToHome).toBe(true);
  });

  test('single click does not zoom by default', () => {
    const harness = createRuntimeHarness();

    now = 10;
    emitMouseClickCycle(harness, { x: 50, y: 50 });

    expect(harness.world.zoomIn).not.toHaveBeenCalled();
    harness.stop();
  });

  test('double click zooms in by default', () => {
    const harness = createRuntimeHarness();

    now = 10;
    emitMouseClickCycle(harness, { x: 50, y: 50 });
    now = 120;
    emitMouseClickCycle(harness, { x: 52, y: 52 });

    expect(harness.world.zoomIn).toHaveBeenCalledTimes(1);
    expect(harness.world.zoomIn).toHaveBeenCalledWith({ x: 52, y: 52 });
    harness.stop();
  });

  test('legacy single-click zoom still works when double click zoom is disabled', () => {
    const harness = createRuntimeHarness({
      enableClickToZoom: true,
      enableDoubleClickZoom: false,
    });

    now = 10;
    emitMouseClickCycle(harness, { x: 50, y: 50 });

    expect(harness.world.zoomIn).toHaveBeenCalledTimes(1);
    expect(harness.world.zoomIn).toHaveBeenCalledWith({ x: 50, y: 50 });
    harness.stop();
  });

  test('holding for 1000ms goes home without starting pan or click zoom', () => {
    vi.useFakeTimers();
    const harness = createRuntimeHarness({ enablePanMomentum: false });

    harness.emitWorld('mousedown', {
      which: 1,
      atlas: { x: 50, y: 50 },
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn(),
    });

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 54, clientY: 50 }));
    expect(harness.runtime.target[1]).toBe(0);

    vi.advanceTimersByTime(1000);

    expect(harness.world.goHome).toHaveBeenCalledTimes(1);
    expect(harness.runtime.transitionManager.goToRegion).toHaveBeenCalledTimes(1);
    expect(harness.world.zoomIn).not.toHaveBeenCalled();

    harness.emitWorld('mouseup', {});
    expect(harness.world.constraintBounds).not.toHaveBeenCalled();
    harness.stop();
  });

  test('moving beyond hold tolerance cancels hold-to-home and resumes pan', () => {
    vi.useFakeTimers();
    const harness = createRuntimeHarness({ enablePanMomentum: false });

    harness.emitWorld('mousedown', {
      which: 1,
      atlas: { x: 50, y: 50 },
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn(),
    });

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 50 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 50 }));

    expect(harness.runtime.target[1]).not.toBe(0);

    vi.advanceTimersByTime(1000);

    expect(harness.world.goHome).not.toHaveBeenCalled();
    harness.emitWorld('mouseup', {});
    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(1);
    harness.stop();
  });

  test('pan momentum is enabled by default', () => {
    expect(defaultConfig.enablePanMomentum).toBe(true);
    const harness = createRuntimeHarness();

    now = 0;
    harness.emitWorld('mousedown', {
      which: 1,
      atlas: { x: 50, y: 50 },
      preventDefault: vi.fn(),
    });

    now = 16;
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 50 }));
    now = 32;
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 50 }));
    const releasedAt = harness.runtime.target[1];
    harness.emitWorld('mouseup', {});

    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);

    harness.runFrame(16);
    expect(harness.runtime.target[1]).toBeGreaterThan(releasedAt);
    harness.stop();
  });

  test('can disable pan momentum', () => {
    const harness = createRuntimeHarness({ enablePanMomentum: false });

    now = 0;
    dragForMomentum(harness, (value) => {
      now = value;
    });
    const releasedAt = harness.runtime.target[1];

    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(1);

    harness.runFrame(16);
    expect(harness.runtime.target[1]).toBe(releasedAt);
    harness.stop();
  });

  test('pan momentum strength increases carry distance', () => {
    const weakHarness = createRuntimeHarness({ panMomentumStrength: 0.5 });
    now = 0;
    dragForMomentum(weakHarness, (value) => {
      now = value;
    });
    const weakReleased = weakHarness.runtime.target[1];
    weakHarness.runFrame(16);
    const weakCarry = weakHarness.runtime.target[1] - weakReleased;
    weakHarness.stop();

    const strongHarness = createRuntimeHarness({ panMomentumStrength: 1.5 });
    now = 0;
    dragForMomentum(strongHarness, (value) => {
      now = value;
    });
    const strongReleased = strongHarness.runtime.target[1];
    strongHarness.runFrame(16);
    const strongCarry = strongHarness.runtime.target[1] - strongReleased;
    strongHarness.stop();

    expect(strongCarry).toBeGreaterThan(weakCarry);
  });

  test('maintains direction for steady drag velocity', () => {
    const harness = createRuntimeHarness();
    now = 0;
    dragWithSteps(
      harness,
      (value) => {
        now = value;
      },
      [
        { t: 0, x: 50, y: 50 },
        { t: 16, x: 45, y: 50 },
        { t: 32, x: 40, y: 50 },
        { t: 48, x: 35, y: 50 },
      ]
    );
    const releasedAt = harness.runtime.target[1];
    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);

    harness.runFrame(16);
    expect(harness.runtime.target[1]).toBeGreaterThan(releasedAt);
    harness.stop();
  });

  test('edge hit during momentum carries through the bound before springing back', () => {
    const harness = createRuntimeHarness();
    now = 0;
    dragForMomentum(harness, (value) => {
      now = value;
    });
    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);

    const boundaryX = 40;
    harness.runtime.constrainBounds = vi.fn((nextTarget: any) => {
      if (nextTarget[1] > boundaryX) {
        return [true, dna([1, boundaryX, 0, boundaryX + 100, 100])] as const;
      }
      return [false, nextTarget] as const;
    });

    harness.runFrame(16);
    const overshootAtImpact = harness.runtime.target[1];

    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);
    expect(overshootAtImpact).toBeGreaterThan(boundaryX);

    let peak = overshootAtImpact;
    for (let i = 0; i < 24; i++) {
      harness.runFrame(16);
      peak = Math.max(peak, harness.runtime.target[1]);
    }

    expect(peak).toBeGreaterThan(overshootAtImpact);
    expect(harness.runtime.target[1]).toBeLessThan(peak);
    harness.stop();
  });

  test('edge hit during momentum does not snap directly to the constrained position', () => {
    const harness = createRuntimeHarness();
    now = 0;
    dragForMomentum(harness, (value) => {
      now = value;
    });
    const releasedAt = harness.runtime.target[1];
    const boundaryX = 40;
    harness.runtime.constrainBounds = vi.fn((nextTarget: any) => {
      if (nextTarget[1] > boundaryX) {
        return [true, dna([1, boundaryX, 0, boundaryX + 100, 100])] as const;
      }
      return [false, nextTarget] as const;
    });

    harness.runFrame(16);

    expect(harness.runtime.target[1]).toBeGreaterThan(releasedAt);
    expect(harness.runtime.target[1]).toBeGreaterThan(boundaryX);
    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);
    harness.stop();
  });

  test('edge hit still overshoots smoothly even with aggressive momentum decay', () => {
    const harness = createRuntimeHarness({ panTimeConstant: 1 });
    now = 0;
    dragForMomentum(harness, (value) => {
      now = value;
    });

    const boundaryX = 40;
    harness.runtime.constrainBounds = vi.fn((nextTarget: any) => {
      if (nextTarget[1] > boundaryX) {
        return [true, dna([1, boundaryX, 0, boundaryX + 100, 100])] as const;
      }
      return [false, nextTarget] as const;
    });

    harness.runFrame(16);

    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);
    expect(harness.runtime.target[1]).toBeGreaterThan(boundaryX);
    harness.stop();
  });
});
