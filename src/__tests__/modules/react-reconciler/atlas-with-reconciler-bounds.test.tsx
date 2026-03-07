/** @vitest-environment happy-dom */

import React, { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

const reconcilerBridge = vi.hoisted(() => {
  let renderIntoHost: ((node: React.ReactNode) => void) | undefined;
  return {
    setRenderIntoHost(next: (node: React.ReactNode) => void) {
      renderIntoHost = next;
    },
    render: vi.fn((node: React.ReactNode) => {
      if (renderIntoHost) {
        renderIntoHost(node);
      }
    }),
    unmount: vi.fn(() => {
      if (renderIntoHost) {
        renderIntoHost(null);
      }
    }),
  };
});

vi.mock('../../../modules/react-reconciler/reconciler', () => ({
  ReactAtlas: {
    render: reconcilerBridge.render,
    unmountComponentAtNode: reconcilerBridge.unmount,
  },
}));

import { AtlasWithReconciler } from '../../../modules/react-reconciler/components/AtlasWithReconciler';
import { BoundsContext } from '../../../modules/react-reconciler/components/AtlasContext';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('AtlasWithReconciler bounds propagation', () => {
  let container: HTMLDivElement;
  let overlayHost: HTMLDivElement;
  let root: Root;
  let overlayRoot: Root;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    reconcilerBridge.setRenderIntoHost(() => undefined);
    if (root) {
      await act(async () => {
        root.unmount();
        await flush();
      });
    }
    if (overlayRoot) {
      await act(async () => {
        overlayRoot.unmount();
        await flush();
      });
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (overlayHost?.parentNode) {
      overlayHost.parentNode.removeChild(overlayHost);
    }
  });

  test('bounds changes update consumers without recreating the preset', async () => {
    container = document.createElement('div');
    overlayHost = document.createElement('div');
    document.body.appendChild(container);
    document.body.appendChild(overlayHost);
    root = createRoot(container);
    overlayRoot = createRoot(overlayHost);
    reconcilerBridge.setRenderIntoHost((node) => {
      overlayRoot.render(node as any);
    });

    const preset = {
      runtime: {
        mode: 'explore',
        goHome: vi.fn(),
      },
    } as any;
    const onCreated = vi.fn();
    const setIsReady = vi.fn();

    function BoundsReader() {
      const bounds = useContext(BoundsContext);
      return <div data-testid="bounds">{`${bounds?.width ?? 0}x${bounds?.height ?? 0}`}</div>;
    }

    await act(async () => {
      root.render(
        <AtlasWithReconciler
          preset={preset}
          mode="explore"
          interactionMode="popmotion"
          bounds={
            {
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              width: 320,
              height: 180,
              right: 320,
              bottom: 180,
            } as any
          }
          onCreated={onCreated}
          setIsReady={setIsReady}
        >
          <BoundsReader />
        </AtlasWithReconciler>
      );
      await flush();
    });

    expect(overlayHost.textContent).toContain('320x180');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(setIsReady).toHaveBeenCalledTimes(1);
    expect(preset.runtime.goHome).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(
        <AtlasWithReconciler
          preset={preset}
          mode="explore"
          interactionMode="popmotion"
          bounds={
            {
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              width: 512,
              height: 256,
              right: 512,
              bottom: 256,
            } as any
          }
          onCreated={onCreated}
          setIsReady={setIsReady}
        >
          <BoundsReader />
        </AtlasWithReconciler>
      );
      await flush();
    });

    expect(overlayHost.textContent).toContain('512x256');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(preset.runtime.goHome).toHaveBeenCalledTimes(1);
    expect(reconcilerBridge.render).toHaveBeenCalledTimes(2);
  });
});
