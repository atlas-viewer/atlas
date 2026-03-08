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
    setOptions: vi.fn(),
    setHomePosition: vi.fn(),
    setHomePaddingPx: vi.fn(),
    resize: vi.fn(),
    registerHook: vi.fn(() => () => undefined),
    stopControllers: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    resetReadyState: vi.fn(),
    getReadyState: vi.fn(() => ({
      cycle: 1,
      reason: 'initial',
      timestamp: undefined,
    })),
  };

  return {
    options,
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
});
