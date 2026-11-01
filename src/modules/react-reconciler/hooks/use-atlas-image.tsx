import React, { useEffect, useRef, useState } from 'react';
import { Runtime, type ViewerMode } from '../../../renderer/runtime';
import { World } from '../../../world';
import { deferToMicrotask } from '../../../utility/defer-to-microtask';
import { CanvasRenderer } from '../../canvas-renderer/canvas-renderer';
import { AtlasContext } from '../components/AtlasContext';
import { ImageResourceLoadingContext, type ImageResourceLoading } from '../components/ImageResourceLoadingContext';
import type { Preset } from '../presets/_types';
import { ReactAtlas } from '../reconciler';
import { useIsomorphicLayoutEffect } from '../utility/react';
import { ModeContext } from './use-mode';

type AtlasProps = {
  width: number;
  height: number;
  mode?: ViewerMode;
  onCreated?: (ctx: Preset) => void | Promise<void>;
  containerRef?: { current?: HTMLElement };
  cover?: boolean;
  resetWorldOnChange?: boolean;
};

/** Render an Atlas scene to an exportable image without mounting a visible viewer. */
export function useAtlasImage(children: React.ReactNode, options: AtlasProps) {
  const { width, height, mode = 'explore', cover, resetWorldOnChange = true } = options;
  const [session, setSession] = useState<{ preset: Preset; resourceLoading: ImageResourceLoading }>();
  const preset = session?.preset;
  const currentPreset = useRef<Preset>();
  const [uri, setUri] = useState<string>();
  const [imageError, setError] = useState<string>();
  const onCreated = useRef(options.onCreated);
  onCreated.current = options.onCreated;

  useIsomorphicLayoutEffect(() => {
    let active = true;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const imageErrors = new Map<string | undefined, { error: unknown; contentId?: string }>();
    const renderer = new CanvasRenderer(canvas, {
      dpi: 1,
      crossOrigin: true,
      onImageError: (event) => {
        if (active && !event.willRetry) {
          imageErrors.set(event.imageUrl, {
            error: event.error || 'Image failed to load',
            contentId: event.contentId,
          });
          refreshResources();
        }
      },
      onImageLoaded: (event) => {
        if (imageErrors.delete(event.imageUrl)) refreshResources();
      },
    });
    const runtime = new Runtime(renderer, new World(), { width, height, x: 0, y: 0, scale: 1 });
    const created: Preset = { name: 'default-preset', canvas, renderer, runtime, unmount: () => runtime.dispose() };
    currentPreset.current = created;
    const loads = new Map<object, { pending: boolean; error?: Error }>();
    const refreshResources = () => {
      if (!active) return;
      const error = Array.from(loads.values()).find((load) => load.error)?.error;
      const imageError = imageErrors.values().next().value?.error;
      setError(error?.message ?? (imageError === undefined ? undefined : String(imageError)));
      runtime.updateNextFrame();
    };
    const resourceLoading: ImageResourceLoading = {
      beginLoad() {
        const token = {};
        loads.set(token, { pending: true });
        refreshResources();
        return {
          complete(error) {
            if (!active || !loads.has(token)) return;
            loads.set(token, { pending: false, error });
            refreshResources();
          },
          dispose() {
            loads.delete(token);
            refreshResources();
          },
        };
      },
    };
    const removeFrame = runtime.registerHook('useAfterFrame', () => {
      if (!active || !renderer.isReady()) return;
      // A removed image must not leave the replacement export in an error state.
      let removedError = false;
      for (const [url, failure] of imageErrors) {
        if (failure.contentId && !renderer.visible.some((paint) => paint.id === failure.contentId)) {
          imageErrors.delete(url);
          removedError = true;
        }
      }
      if (removedError) refreshResources();
      if (imageErrors.size || Array.from(loads.values()).some((load) => load.pending || load.error)) return;
      try {
        setUri(canvas.toDataURL());
        setError(undefined);
      } catch (error) {
        setError(String(error));
      }
    });
    const removeLayout = runtime.world.addLayoutSubscriber((type) => {
      if (resetWorldOnChange && type === 'recalculate-world-size') {
        if (cover) runtime.cover();
        else runtime.goHome();
      }
    });
    const cancel = deferToMicrotask(() => {
      setError(undefined);
      setUri(undefined);
      Promise.resolve()
        .then(() => (active ? onCreated.current?.(created) : undefined))
        .then(() => {
          if (active) setSession({ preset: created, resourceLoading });
        })
        .catch((error) => {
          if (active) setError(String(error));
        });
    });
    return () => {
      active = false;
      if (currentPreset.current === created) currentPreset.current = undefined;
      cancel();
      removeFrame();
      removeLayout();
      ReactAtlas.unmountComponentAtNode(runtime);
      created.unmount();
      canvas.width = canvas.height = 0;
    };
  }, [width, height, cover, resetWorldOnChange]);

  useEffect(() => {
    if (!session || !preset || currentPreset.current !== preset) return;
    preset.runtime.mode = mode;
    ReactAtlas.render(
      <ModeContext.Provider value={mode}>
        <AtlasContext.Provider value={preset}>
          <ImageResourceLoadingContext.Provider value={session.resourceLoading}>
            {children}
          </ImageResourceLoadingContext.Provider>
        </AtlasContext.Provider>
      </ModeContext.Provider>,
      preset.runtime
    );
  }, [children, preset, mode, session]);

  return { loading: !uri && !imageError, uri, imageError };
}
