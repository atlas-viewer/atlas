import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { ReactAtlas } from '../../../modules/react-reconciler/reconciler';
import type { ImageResourceLoading } from '../../../modules/react-reconciler/components/ImageResourceLoadingContext';
import { useAtlasImage } from '../../../modules/react-reconciler/hooks/use-atlas-image';

const { records } = vi.hoisted(() => ({ records: [] as any[] }));
vi.mock('../../../modules/canvas-renderer/canvas-renderer', () => ({
  CanvasRenderer: class {
    constructor(public canvas: HTMLCanvasElement, public options: any) {}
    isReady() {
      return true;
    }
  },
}));
vi.mock('../../../renderer/runtime', () => ({
  Runtime: class {
    hooks: Record<string, () => void> = {};
    dispose = vi.fn();
    goHome = vi.fn();
    updateNextFrame = vi.fn();
    cover = vi.fn();
    constructor(public renderer: any, public world: any) {
      records.push(this);
    }
    registerHook(name: string, fn: () => void) {
      this.hooks[name] = fn;
      return () => delete this.hooks[name];
    }
  },
}));
vi.mock('../../../modules/react-reconciler/reconciler', () => ({
  ReactAtlas: {
    render: vi.fn(),
    unmountComponentAtNode: vi.fn(),
  },
}));
afterEach(() => {
  records.length = 0;
  vi.restoreAllMocks();
});

test.each(['retry', 'replace'])('an image failure clears after a successful %s', async (recovery) => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,recovered',
  });
  const mounted = await mountExport();
  const runtime = records.at(-1);
  runtime.renderer.visible = [{ id: 'image' }];
  await act(async () => {
    runtime.renderer.options.onImageError({
      imageUrl: 'tile.jpg',
      contentId: 'image',
      willRetry: false,
      error: new Error('Tile failed'),
    });
    runtime.hooks.useAfterFrame();
  });
  expect(mounted.container.textContent).toContain('Tile failed');
  await act(async () => {
    if (recovery === 'retry') runtime.renderer.options.onImageLoaded({ imageUrl: 'tile.jpg' });
    else runtime.renderer.visible = [];
    runtime.hooks.useAfterFrame();
  });
  expect(mounted.container.textContent).toBe('data:image/png;base64,recovered');
  await mounted.unmount();
  delete (HTMLCanvasElement.prototype as any).toDataURL;
});

test('publishes an offscreen render after initialization, survives StrictMode, and disposes on resize/unmount', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const toDataURL = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toDataURL');
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,rendered',
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const created = vi.fn();
  function Demo({ width }: { width: number }) {
    const result = useAtlasImage(null, { width, height: 100, onCreated: created });
    return <output>{result.uri || (result.loading ? 'loading' : result.imageError)}</output>;
  }
  await act(async () =>
    root.render(
      <React.StrictMode>
        <Demo width={100} />
      </React.StrictMode>
    )
  );
  expect(created).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe('loading');
  await act(async () => records.at(-1).hooks.useAfterFrame());
  expect(container.textContent).toContain('data:image/png;base64,rendered');
  const previous = records.at(-1);
  await act(async () =>
    root.render(
      <React.StrictMode>
        <Demo width={200} />
      </React.StrictMode>
    )
  );
  expect(previous.dispose).toHaveBeenCalledTimes(1);
  expect(created).toHaveBeenCalledTimes(2);
  expect(created.mock.calls[1][0].canvas.width).toBe(200);
  const latest = records.at(-1);
  await act(async () => root.unmount());
  expect(latest.dispose).toHaveBeenCalledTimes(1);
  container.remove();
  if (toDataURL) Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', toDataURL);
  else delete (HTMLCanvasElement.prototype as any).toDataURL;
});

async function mountExport(onCreated?: (preset: any) => void | Promise<void>) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  function Demo({ version = 0 }: { version?: number }) {
    const result = useAtlasImage(<React.Fragment>{version}</React.Fragment>, {
      width: 100,
      height: 100,
      resetWorldOnChange: false,
      onCreated,
    });
    return <output>{result.imageError || result.uri || (result.loading ? 'loading' : '')}</output>;
  }
  await act(async () => root.render(<Demo />));
  return {
    container,
    rerender: async () => {
      await act(async () => root.render(<Demo version={1} />));
    },
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

test('preserves a custom viewport across scene and mode-independent parent rerenders', async () => {
  const mounted = await mountExport((preset) => {
    preset.runtime.customCamera = { x: 10, y: 20 };
  });
  const runtime = records.at(-1);
  await mounted.rerender();
  expect(runtime.customCamera).toEqual({ x: 10, y: 20 });
  expect(runtime.goHome).not.toHaveBeenCalled();
  expect(runtime.cover).not.toHaveBeenCalled();
  await mounted.unmount();
});

test('waits for asynchronous initialization before mounting the scene', async () => {
  let finish!: () => void;
  const before = vi.mocked(ReactAtlas.render).mock.calls.length;
  const mounted = await mountExport(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  expect(vi.mocked(ReactAtlas.render).mock.calls).toHaveLength(before);
  await act(async () => finish());
  expect(vi.mocked(ReactAtlas.render).mock.calls.length).toBeGreaterThan(before);
  await mounted.unmount();
});

test('metadata failures survive rendered frames and recover when the failed resource is replaced', async () => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/png;base64,recovered',
  });
  const mounted = await mountExport();
  const tree = vi.mocked(ReactAtlas.render).mock.calls.at(-1)![0] as React.ReactElement;
  const resourceLoading = tree.props.children.props.children.props.value as ImageResourceLoading;
  const runtime = records.at(-1);
  let load!: ReturnType<ImageResourceLoading['beginLoad']>;
  await act(async () => {
    load = resourceLoading.beginLoad();
    runtime.hooks.useAfterFrame();
  });
  expect(mounted.container.textContent).toBe('loading');
  await act(async () => {
    load.complete(new Error('Metadata HTTP 404'));
    runtime.hooks.useAfterFrame();
  });
  expect(mounted.container.textContent).toBe('Metadata HTTP 404');
  await act(async () => {
    load.dispose();
    load = resourceLoading.beginLoad();
  });
  await act(async () => {
    load.complete();
    runtime.hooks.useAfterFrame();
  });
  expect(mounted.container.textContent).toBe('data:image/png;base64,recovered');
  await mounted.unmount();
  delete (HTMLCanvasElement.prototype as any).toDataURL;
});
