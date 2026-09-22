/** @vitest-environment happy-dom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Atlas } from '../../../modules/react-reconciler/Atlas';
import { presets } from '../../../modules/react-reconciler/presets';

type MockPresetRecord = ReturnType<typeof createMockPreset>;

function createMockPreset(options: any) {
  const layoutSubscribers = new Set<(type: string) => void>();
  const runtime = {
    id: `runtime-${Math.random().toString(36).slice(2)}`,
    mode: 'explore',
    world: {
      width: 1024,
      height: 1024,
      zones: [],
      getActiveZone: () => undefined,
      addLayoutSubscriber: vi.fn((callback: (type: string) => void) => {
        layoutSubscribers.add(callback);
        return () => {
          layoutSubscribers.delete(callback);
        };
      }),
    },
    hookOptions: {
      enableFilters: false,
      filters: {
        brightness: 0,
        contrast: 0,
        grayscale: 0,
        hueRotate: 0,
        invert: 0,
        saturate: 0,
        sepia: 0,
        blur: 0,
      },
    },
    manualHomePosition: false,
    viewRotation: 0,
    goHome: vi.fn(),
    getViewport: vi.fn(() => ({
      x: 12,
      y: 34,
      width: 300,
      height: 200,
      scale: 1,
    })),
    getHomeTarget: vi.fn(() => ({ x: 0, y: 0, width: 1024, height: 683 })),
    isViewportAtHomeZoomLevel: vi.fn(() => true),
    isViewportAtHome: vi.fn(() => false),
    setViewport: vi.fn(),
    updateNextFrame: vi.fn(),
    setIdle: vi.fn(),
    setOptions: vi.fn(),
    setHomePosition: vi.fn(),
    setHomePaddingPx: vi.fn(),
    resize: vi.fn(),
    registerHook: vi.fn(() => () => undefined),
    stopControllers: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    resetReadyState: vi.fn(),
    setResourceTransitionKey: vi.fn(),
    getReadyState: vi.fn(() => ({
      cycle: 1,
      reason: 'initial',
      timestamp: undefined,
    })),
  };

  return {
    options,
    layoutSubscribers,
    runtime,
    preset: {
      name: 'default-preset',
      runtime,
      renderer: {
        renderers: [{ dpi: 1 }],
        getRendererScreenPosition: () => ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          width: 300,
          height: 200,
        }),
      },
      em: {
        updateBounds: vi.fn(),
      },
      canvas: options.canvasElement,
      parityCanvas: options.parityCanvasElement,
      overlay: options.overlayElement,
      container: options.containerElement,
      navigator: options.navigatorElement,
      unmount: vi.fn(),
    },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Atlas lifecycle runtime behavior', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalDefaultPreset: (typeof presets)['default-preset'];

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
        await flush();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (originalDefaultPreset) {
      presets['default-preset'] = originalDefaultPreset;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('callback churn and same-value navigator options do not recreate the preset', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      createdPresets.push(record);
      return record.preset as any;
    }) as any;

    const firstOnImageError = vi.fn();
    const firstOnWebGLFallback = vi.fn();

    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          unstable_noReconciler
          onImageError={firstOnImageError}
          onWebGLFallback={firstOnWebGLFallback}
          navigatorOptions={{
            width: 140,
            style: {
              viewportStroke: 'rgba(1, 2, 3, 0.4)',
            },
          }}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    expect(createdPresets).toHaveLength(1);

    const secondOnImageError = vi.fn();
    const secondOnWebGLFallback = vi.fn();

    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          unstable_noReconciler
          onImageError={secondOnImageError}
          onWebGLFallback={secondOnWebGLFallback}
          navigatorOptions={{
            width: 140,
            style: {
              viewportStroke: 'rgba(1, 2, 3, 0.4)',
            },
          }}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    expect(createdPresets).toHaveLength(1);

    act(() => {
      createdPresets[0].options.onImageError?.({ renderer: 'canvas' });
      createdPresets[0].options.onWebGLFallback?.({ reason: 'image-load-failed' });
    });

    expect(firstOnImageError).not.toHaveBeenCalled();
    expect(firstOnWebGLFallback).not.toHaveBeenCalled();
    expect(secondOnImageError).toHaveBeenCalledTimes(1);
    expect(secondOnWebGLFallback).toHaveBeenCalledTimes(1);
  });

  test('home navigator hides after idle at home zoom and keeps partial fade when zoomed in', async () => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      createdPresets.push(record);
      return record.preset as any;
    }) as any;

    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          enableNavigator
          unstable_noReconciler
          navigatorOptions={{ className: 'my-nav', idleMs: 50 }}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });
    const navigator = container.querySelector('.atlas-navigator')!;
    expect(navigator.classList.contains('my-nav')).toBe(true);
    expect((navigator as HTMLElement).style.getPropertyValue('--atlas-navigator-opacity-idle')).toBe('');
    expect(container.querySelector('.atlas-navigator-expand')).toBeNull();
    expect(navigator.classList.contains('atlas-navigator--hidden-at-home')).toBe(false);

    await act(async () => vi.advanceTimersByTime(51));
    expect(navigator.classList.contains('atlas-navigator--idle')).toBe(true);
    expect(navigator.classList.contains('atlas-navigator--hidden-at-home')).toBe(true);

    createdPresets[0].runtime.isViewportAtHomeZoomLevel.mockReturnValue(false);
    await act(async () => {
      createdPresets[0].layoutSubscribers.forEach((subscriber) => subscriber('repaint'));
    });
    expect(navigator.classList.contains('atlas-navigator--idle')).toBe(true);
    expect(navigator.classList.contains('atlas-navigator--hidden-at-home')).toBe(false);
    expect(createdPresets[0].runtime.registerHook).toHaveBeenCalledWith('useAfterFrame', expect.any(Function));

    createdPresets[0].runtime.isViewportAtHomeZoomLevel.mockReturnValue(true);
    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          enableNavigator
          unstable_noReconciler
          navigatorOptions={{ className: 'my-nav', idleMs: 50, hideAtHomeWhenIdle: false }}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
      createdPresets[0].layoutSubscribers.forEach((subscriber) => subscriber('repaint'));
    });
    expect(navigator.classList.contains('atlas-navigator--idle')).toBe(true);
    expect(navigator.classList.contains('atlas-navigator--hidden-at-home')).toBe(false);
  });

  test('hideUnlessZoomed hides immediately at home zoom and shows on zoom in', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      createdPresets.push(record);
      return record.preset as any;
    }) as any;

    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          enableNavigator
          unstable_noReconciler
          navigatorOptions={{ hideUnlessZoomed: true }}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    const navigator = container.querySelector('.atlas-navigator')!;
    expect(navigator.classList.contains('atlas-navigator--hidden-at-home')).toBe(true);
    expect(navigator.classList.contains('atlas-navigator--idle')).toBe(false);

    createdPresets[0].runtime.isViewportAtHomeZoomLevel.mockReturnValue(false);
    await act(async () => {
      createdPresets[0].layoutSubscribers.forEach((subscriber) => subscriber('repaint'));
    });
    expect(navigator.classList.contains('atlas-navigator--hidden-at-home')).toBe(false);
  });

  test('navigator reports a user resize and accepts a restored width', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      createdPresets.push(record);
      return record.preset as any;
    }) as any;
    const onResize = vi.fn();

    const render = async (width: number) => {
      await act(async () => {
        root.render(
          <Atlas width={300} height={200} enableNavigator unstable_noReconciler navigatorOptions={{ width, onResize }}>
            <React.Fragment />
          </Atlas>
        );
        await flush();
      });
    };

    await render(120);
    const grip = container.querySelector('.atlas-navigator-resize')!;
    const canvas = container.querySelector('.atlas-navigator-canvas') as HTMLCanvasElement;
    expect(canvas.style.width).toBe('120px');

    await act(async () => {
      grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 80 }));
      window.dispatchEvent(new PointerEvent('pointerup'));
    });
    expect(onResize).toHaveBeenCalledExactlyOnceWith(140);
    expect(canvas.style.width).toBe('140px');

    await act(async () => {
      grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onResize).toHaveBeenLastCalledWith(150);
    expect(canvas.style.width).toBe('150px');

    await render(160);
    expect(createdPresets).toHaveLength(1);
    expect(canvas.style.width).toBe('160px');
  });

  test('rotation refreshes the home navigator region', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const beforeFrameHooks = new Set<() => void>();
    const setRegion = vi.fn();
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      (record.preset.renderer.renderers as any[]).push({ setRegion, invalidateWorldLayer: vi.fn() });
      (record.preset.canvas as HTMLCanvasElement).getContext = vi.fn(() => ({
        setTransform: vi.fn(),
        scale: vi.fn(),
      })) as any;
      record.runtime.getHomeTarget.mockImplementation(() => ({
        x: 0,
        y: 0,
        width: record.runtime.viewRotation ? 683 : 1024,
        height: record.runtime.viewRotation ? 1024 : 683,
      }));
      record.runtime.registerHook.mockImplementation((name: string, callback: () => void) => {
        if (name === 'useBeforeFrame') beforeFrameHooks.add(callback);
        return () => beforeFrameHooks.delete(callback);
      });
      createdPreset = record;
      return record.preset as any;
    }) as any;
    let createdPreset: MockPresetRecord;

    await act(async () => {
      root.render(
        <Atlas width={300} height={200} enableNavigator unstable_noReconciler>
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });
    expect(setRegion).toHaveBeenCalledWith({ x: 0, y: 0, width: 1024, height: 683 });

    const canvas = container.querySelector('.atlas-navigator-canvas') as HTMLCanvasElement;
    let backingWidth = canvas.width;
    let backingWrites = 0;
    Object.defineProperty(canvas, 'width', {
      configurable: true,
      get: () => backingWidth,
      set: (width: number) => {
        backingWidth = width;
        backingWrites++;
      },
    });

    createdPreset.runtime.viewRotation = 90;
    await act(async () => {
      beforeFrameHooks.forEach((hook) => hook());
    });
    expect(setRegion).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 683, height: 1024 });
    expect(backingWrites).toBe(0);
  });

  test('annotation visibility updates the navigator without recreating the preset', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const setShowAnnotations = vi.fn();
    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      (record.preset.renderer.renderers as any[]).push({ setShowAnnotations, invalidateWorldLayer: vi.fn() });
      createdPresets.push(record);
      return record.preset as any;
    }) as any;

    const render = async (showAnnotations: boolean) => {
      await act(async () => {
        root.render(
          <Atlas width={300} height={200} enableNavigator unstable_noReconciler navigatorOptions={{ showAnnotations }}>
            <React.Fragment />
          </Atlas>
        );
        await flush();
      });
    };

    await render(false);
    await render(true);
    expect(createdPresets).toHaveLength(1);
    expect(setShowAnnotations).toHaveBeenLastCalledWith(true);
  });

  test('visibility and explicit idle combine without remounting, and disconnect on unmount', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      createdPresets.push(record);
      return record.preset as any;
    }) as any;
    const observers: {
      callback: IntersectionObserverCallback;
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(public callback: IntersectionObserverCallback) {
          observers.push(this);
        }
      }
    );
    const render = async (idle: boolean, loadWhenVisible = true) => {
      await act(async () => {
        root.render(
          <Atlas width={300} height={200} unstable_noReconciler idle={idle} loadWhenVisible={loadWhenVisible}>
            <React.Fragment />
          </Atlas>
        );
        await flush();
      });
    };
    const reportVisible = (visible: boolean) =>
      act(() => {
        observers[0].callback([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver);
      });

    await render(false);
    const runtime = createdPresets[0].runtime;
    expect(runtime.setIdle).toHaveBeenLastCalledWith(true);
    expect(observers[0].observe).toHaveBeenCalledWith(createdPresets[0].preset.canvas);
    reportVisible(true);
    expect(runtime.setIdle).toHaveBeenLastCalledWith(false);
    await render(true);
    reportVisible(true);
    expect(runtime.setIdle).toHaveBeenLastCalledWith(true);
    reportVisible(false);
    await render(false);
    expect(runtime.setIdle).toHaveBeenLastCalledWith(true);
    reportVisible(true);
    expect(runtime.setIdle).toHaveBeenLastCalledWith(false);
    reportVisible(false);
    await render(false, false);
    expect(runtime.setIdle).toHaveBeenLastCalledWith(false);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    reportVisible(false);
    expect(runtime.setIdle).toHaveBeenLastCalledWith(false);
    await render(false);
    expect(observers).toHaveLength(2);
    expect(createdPresets).toHaveLength(1);
    await act(async () => {
      root.render(null);
      await flush();
    });
    expect(observers[1].disconnect).toHaveBeenCalledTimes(1);
  });

  test('visibility loading falls back to normal loading without IntersectionObserver', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalDefaultPreset = presets['default-preset'];
    let record!: MockPresetRecord;
    presets['default-preset'] = ((options: any) => {
      record = createMockPreset(options);
      return record.preset as any;
    }) as any;
    vi.stubGlobal('IntersectionObserver', undefined);
    await act(async () => {
      root.render(
        <Atlas width={300} height={200} unstable_noReconciler loadWhenVisible>
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });
    expect(record.runtime.setIdle).toHaveBeenLastCalledWith(false);
    await act(async () => {
      root.render(
        <Atlas width={300} height={200} unstable_noReconciler loadWhenVisible idle>
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });
    expect(record.runtime.setIdle).toHaveBeenLastCalledWith(true);
  });

  test('hard-construction changes recreate once and immediately reapply runtime options', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      createdPresets.push(record);
      return record.preset as any;
    }) as any;

    const runtimeOptions = { maxOverZoom: 7 };

    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          unstable_noReconciler
          interactionMode="popmotion"
          runtimeOptions={runtimeOptions}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    expect(createdPresets).toHaveLength(1);
    expect(createdPresets[0].options.runtimeOptions).toEqual(runtimeOptions);
    expect(createdPresets[0].runtime.setOptions).toHaveBeenCalledWith(runtimeOptions);

    await act(async () => {
      root.render(
        <Atlas
          width={300}
          height={200}
          unstable_noReconciler
          interactionMode="pdf-scroll-zone"
          runtimeOptions={runtimeOptions}
        >
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    expect(createdPresets).toHaveLength(2);
    expect(createdPresets[0].preset.unmount).toHaveBeenCalledTimes(1);
    expect(createdPresets[1].options.runtimeOptions).toEqual(runtimeOptions);
    expect(createdPresets[1].runtime.setOptions).toHaveBeenCalledWith(runtimeOptions);
  });

  test('world layout events preserve the latest static container and overlay measurements', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    let record!: MockPresetRecord;
    vi.spyOn(presets, 'static-preset').mockImplementation((options: any) => {
      record = createMockPreset(options);
      return record.preset as any;
    });

    await act(async () => {
      root.render(
        <Atlas width={300} height={200} renderPreset="static-preset" unstable_noReconciler>
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    const element = container.querySelector('.atlas')!;
    const measure = vi.spyOn(element, 'getBoundingClientRect');
    for (const [width, height] of [
      [300, 200],
      [480, 320],
    ]) {
      measure.mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height } as DOMRect);
      await act(async () => {
        window.dispatchEvent(new Event('resize'));
        await flush();
      });
      for (const event of ['recalculate-world-size', 'zone-changed']) {
        act(() => record.layoutSubscribers.forEach((callback) => callback(event)));
        for (const target of [record.preset.container, record.preset.overlay]) {
          expect(target.style.width).toBe(`${width}px`);
          expect(target.style.height).toBe(`${height}px`);
        }
      }
    }
  });

  test('forwards resourceTransitionKey to the runtime', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const createdPresets: MockPresetRecord[] = [];
    originalDefaultPreset = presets['default-preset'];
    presets['default-preset'] = ((options: any) => {
      const record = createMockPreset(options);
      if (record.preset.canvas) {
        record.preset.canvas.width = 300;
        record.preset.canvas.height = 200;
      }
      createdPresets.push(record);
      return record.preset as any;
    }) as any;

    await act(async () => {
      root.render(
        <Atlas width={300} height={200} unstable_noReconciler resourceTransitionKey="one">
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    expect(createdPresets[0].runtime.setResourceTransitionKey).toHaveBeenLastCalledWith('one');

    await act(async () => {
      root.render(
        <Atlas width={300} height={200} unstable_noReconciler resourceTransitionKey="two">
          <React.Fragment />
        </Atlas>
      );
      await flush();
    });

    expect(createdPresets[0].runtime.setResourceTransitionKey).toHaveBeenLastCalledWith('two');
  });
});
