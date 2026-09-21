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
    goHome: vi.fn(),
    getViewport: vi.fn(() => ({
      x: 12,
      y: 34,
      width: 300,
      height: 200,
      scale: 1,
    })),
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
              background: 'rgba(1, 2, 3, 0.4)',
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
              background: 'rgba(1, 2, 3, 0.4)',
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
    const observers: { callback: IntersectionObserverCallback; observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: IntersectionObserverCallback) { observers.push(this); }
    });
    const render = async (idle: boolean, loadWhenVisible = true) => {
      await act(async () => {
        root.render(<Atlas width={300} height={200} unstable_noReconciler idle={idle} loadWhenVisible={loadWhenVisible}>
          <React.Fragment />
        </Atlas>);
        await flush();
      });
    };
    const reportVisible = (visible: boolean) => act(() => {
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
    await act(async () => { root.render(null); await flush(); });
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
      root.render(<Atlas width={300} height={200} unstable_noReconciler loadWhenVisible><React.Fragment /></Atlas>);
      await flush();
    });
    expect(record.runtime.setIdle).toHaveBeenLastCalledWith(false);
    await act(async () => {
      root.render(<Atlas width={300} height={200} unstable_noReconciler loadWhenVisible idle><React.Fragment /></Atlas>);
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
    for (const [width, height] of [[300, 200], [480, 320]]) {
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
