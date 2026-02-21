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
  };

  const runtime: any = {
    mode: 'explore',
    world,
    target,
    transitionManager: {
      stopTransition: vi.fn(),
      customTransition: vi.fn((applyTransition: any) => {
        applyTransition(pendingTransition);
        if (!pendingTransition.done) {
          target[1] = pendingTransition.to[1];
          target[2] = pendingTransition.to[2];
          target[3] = pendingTransition.to[3];
          target[4] = pendingTransition.to[4];
        }
      }),
      constrainBounds: vi.fn(),
      zoomTo: vi.fn(),
      goToRegion: vi.fn(),
    },
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

  const controller = popmotionController(config);
  const stop = controller.start(runtime);

  return {
    runtime,
    world,
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
    },
  };
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
    vi.restoreAllMocks();
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

  test('edge hit during momentum requests animated bounds constrain', () => {
    const harness = createRuntimeHarness();
    now = 0;
    dragForMomentum(harness, (value) => {
      now = value;
    });
    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(0);

    harness.runtime.constrainBounds = vi.fn((nextTarget: any) => [true, nextTarget] as const);
    harness.runFrame(16);

    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(1);
    expect(harness.world.constraintBounds).toHaveBeenCalledWith();
    harness.stop();
  });

  test('edge hit during momentum does not snap target to constrained position', () => {
    const harness = createRuntimeHarness();
    now = 0;
    dragForMomentum(harness, (value) => {
      now = value;
    });
    const releasedAt = harness.runtime.target[1];
    harness.runtime.constrainBounds = vi.fn(() => [true, dna([1, 500, 0, 600, 100])] as const);

    harness.runFrame(16);

    expect(harness.runtime.target[1]).toBe(releasedAt);
    expect(harness.world.constraintBounds).toHaveBeenCalledTimes(1);
    harness.stop();
  });
});
