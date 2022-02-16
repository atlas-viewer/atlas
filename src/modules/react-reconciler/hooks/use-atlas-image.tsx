import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { ReactAtlas } from '../reconciler';
import { Runtime, ViewerMode } from '../../../renderer/runtime';
import { CanvasRenderer } from '../../canvas-renderer/canvas-renderer';
import { popmotionController } from '../../popmotion-controller/popmotion-controller';
import { World } from '../../../world';
import { AtlasContext } from '../components/AtlasContext';
import { ModeContext } from './use-mode';
import { Preset } from '../presets/_types';
import { usePreset } from './use-preset';

type AtlasProps = {
  width: number;
  height: number;
  mode?: ViewerMode;
  onCreated?: (ctx: Preset) => void | Promise<void>;
  containerRef?: { current?: HTMLElement };
  cover?: boolean;
  resetWorldOnChange?: boolean;
};

export const useAtlasImage: (
  children: any,
  options: AtlasProps
) => { uri: string | undefined; loading?: boolean; imageError?: string } = (
  children,
  { onCreated, resetWorldOnChange = true, mode = 'explore', cover, containerRef, ...restProps }
) => {
  const [ready, setReady] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imageError, setError] = useState<string | undefined>(undefined);
  // Reference to the current HTML Canvas element
  // Set by React by passing <canvas ref={...} />
  // Used to instantiate the controller and viewer with the correct HTML element.
  const canvasRef = useRef<HTMLCanvasElement>();

  // This is an HTML element that sits above the Canvas element that is passed to the controller.
  // Additional non-canvas drawn elements can be placed here and positioned. CSS is applied to this
  // element by this component to absolutely position it. The overlay is updated if the "bounds" change
  // on the parent element and matches the size of it.
  const overlayRef = useRef<HTMLDivElement>();

  // This measures the height and width of the Atlas element.
  // const [ref, bounds] = useMeasure({ scroll: true });
  const bounds = useMemo(() => {
    return {
      width: restProps.width,
      height: restProps.height,
    };
  }, [restProps.width, restProps.height]);

  // This is a big messy global state of atlas that is updated outside of Reacts lifecycle.
  const [presetName, preset, viewport, refs] = usePreset(undefined, {
    width: restProps.width,
    height: restProps.height,
  });

  // Create our in memory canvas.
  useLayoutEffect(() => {
    const $cvs = document.createElement('canvas');
    $cvs.height = bounds.height;
    $cvs.width = bounds.width;
    canvasRef.current = $cvs;
  }, []);

  useLayoutEffect(() => {
    const $cvs = canvasRef.current;
    if ($cvs) {
      $cvs.height = bounds.height;
      $cvs.width = bounds.width;
    }
  }, [bounds.width, bounds.height]);

  useEffect(() => {
    if (preset) {
      const runtime = preset.runtime;
      return runtime.registerHook('useAfterFrame', () => {
        if (canvasRef.current) {
          try {
            setImageUrl(canvasRef.current.toDataURL());
          } catch (e) {
            if (e instanceof Error) {
              setError(e.message);
            }
          }
        }
      });
    }
    return () => {
      // no-op
    };
  }, []);

  useEffect(() => {
    if (preset) {
      const runtime = preset.runtime;
      return runtime.world.addLayoutSubscriber((type) => {
        if (type === 'ready') {
          setReady(true);
        }
      });
    }
    return () => {
      // no-op
    };
  }, []);

  // This changes the mutable state object with the position (top/left/width/height) of the
  // canvas element on the page. This is used in the editing tools such as BoxDraw for comparing
  // positions.
  useEffect(() => {
    if (preset && preset.em) {
      preset.em.updateBounds();
    }
  }, [bounds]);

  // This changes the mode in the state object when the prop passed in changes. This will
  // be picked up by the renderer on the next method. There is not current way to detect this change.
  // @todo create a mode change event.
  useEffect(() => {
    if (preset) {
      preset.runtime.mode = mode;
    }
  }, [mode]);

  // When the width and height change this will resize the viewer and then reset the view to fit the element.
  // @todo improve or make configurable.
  // @todo resize event.
  useEffect(() => {
    if (preset) {
      const rt: Runtime = preset.runtime;

      rt.resize(viewport.current.width, restProps.width, viewport.current.height, restProps.height);
      if (cover) {
        rt.cover();
      } else {
        rt.goHome();
      }
      viewport.current.width = restProps.width;
      viewport.current.height = restProps.height;
      rt.updateNextFrame();
    }
  }, [restProps.width, restProps.height]);

  // When the bounds of the container change, we need to reflect those changes in the overlay.
  // @todo move to canvas.
  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
  }, [bounds.height, bounds.width]);

  // When the window resizes we need to recalculate the width.
  // @todo possibly move to controller.
  useLayoutEffect(() => {
    const windowResizeCallback = () => {
      if (preset && preset.runtime) {
        const rt: Runtime = preset.runtime;

        rt.resize(viewport.current.width, restProps.width, viewport.current.height, restProps.height);
        viewport.current.width = restProps.width;
        viewport.current.height = restProps.height;
        rt.updateNextFrame();
      }
    };

    window.addEventListener('resize', windowResizeCallback);

    return () => window.removeEventListener('resize', windowResizeCallback);
  }, [preset, restProps.height, restProps.width]);

  const Canvas = useCallback(
    function Canvas(props: { children: React.ReactElement }): JSX.Element {
      const activate = () => {
        if (preset) {
          preset.ready = true;
        }
      };

      useEffect(() => {
        if (preset) {
          const result = onCreated && onCreated(preset);
          return void (result && result.then ? result.then(activate) : activate());
        }
        return () => {
          // no-op
        }
      }, []);

      return props.children;
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset]
  );

  useEffect(() => {
    if (preset && preset.runtime) {
      const rt = preset.runtime;
      if (resetWorldOnChange) {
        return rt.world.addLayoutSubscriber((type) => {
          if (type === 'recalculate-world-size') {
            rt.goHome({ cover });
          }
        });
      }
    }
    return () => {
      // no-op
    };
  }, [preset, cover, resetWorldOnChange]);

  useLayoutEffect(() => {
    if (preset) {
      ReactAtlas.render(
        <Canvas>
          <ModeContext.Provider value={mode}>
            <AtlasContext.Provider value={preset}>{children}</AtlasContext.Provider>
          </ModeContext.Provider>
        </Canvas>,
        preset.runtime
      );
    }
  }, [preset, mode, children]);

  return {
    loading: !imageUrl && ready,
    uri: imageUrl,
    imageError,
  };
};
