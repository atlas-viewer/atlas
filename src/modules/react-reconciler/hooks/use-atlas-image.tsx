import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';
import { ReactAtlas } from '../reconciler';
import { Runtime, ViewerMode } from '../../../renderer/runtime';
import { CanvasRenderer } from '../../canvas-renderer/canvas-renderer';
import { popmotionController } from '../../popmotion-controller/popmotion-controller';
import { World } from '../../../world';
import { AtlasContextType, AtlasContext } from '../components/AtlasContext';
import { ModeContext } from './use-mode';

type AtlasProps = {
  width: number;
  height: number;
  mode?: ViewerMode;
  onCreated?: (ctx: AtlasContextType) => void | Promise<void>;
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
  const state = useRef<AtlasContextType>({
    ready: false,
    viewport: { width: restProps.width, height: restProps.height, x: 0, y: 0, scale: 1 },
    renderer: undefined,
    runtime: undefined,
    controller: undefined,
    canvas: canvasRef,
    canvasPosition: undefined,
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
    const runtime = state.current.runtime;
    if (runtime) {
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
    const runtime = state.current.runtime;
    if (runtime) {
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
    // @ts-ignore
    state.current.canvasPosition = bounds;
    if (state.current.em) {
      state.current.em.updateBounds();
    }
  }, [bounds]);

  // This changes the mode in the state object when the prop passed in changes. This will
  // be picked up by the renderer on the next method. There is not current way to detect this change.
  // @todo create a mode change event.
  useEffect(() => {
    if (state.current && state.current.runtime) {
      state.current.runtime.mode = mode;
    }
  }, [state, mode]);

  // When the width and height change this will resize the viewer and then reset the view to fit the element.
  // @todo improve or make configurable.
  // @todo resize event.
  useEffect(() => {
    if (state.current.runtime) {
      const rt: Runtime = state.current.runtime;

      rt.resize(state.current.viewport.width, restProps.width, state.current.viewport.height, restProps.height);
      if (cover) {
        rt.cover();
      } else {
        rt.goHome();
      }
      state.current.viewport.width = restProps.width;
      state.current.viewport.height = restProps.height;
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
      if (state.current.runtime) {
        const rt: Runtime = state.current.runtime;

        rt.resize(state.current.viewport.width, restProps.width, state.current.viewport.height, restProps.height);
        state.current.viewport.width = restProps.width;
        state.current.viewport.height = restProps.height;
        rt.updateNextFrame();
      }
    };

    window.addEventListener('resize', windowResizeCallback);

    return () => window.removeEventListener('resize', windowResizeCallback);
  }, [restProps.height, restProps.width]);

  const Canvas = useCallback(
    function Canvas(props: { children: React.ReactElement }): JSX.Element {
      const activate = () => {
        state.current.ready = true;
      };

      useEffect(() => {
        const result = onCreated && onCreated(state.current);
        return void (result && result.then ? result.then(activate) : activate());
      }, []);

      return props.children;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Render v-dom into scene
  useLayoutEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) {
      throw new Error('Something went wrong mounting canvas.');
    }

    // @todo move this out.
    currentCanvas.style.userSelect = 'none';

    state.current.canvas = canvasRef;
    const controllers: any[] = [];

    if (containerRef && containerRef.current) {
      const controller = popmotionController({
        minZoomFactor: 0.5,
        maxZoomFactor: 3,
        enableClickToZoom: false,
      });
      state.current.controller = controller;
      controllers.push(controller);
    }

    const renderer = new CanvasRenderer(currentCanvas, { crossOrigin: true, debug: false });
    state.current.renderer = renderer;

    const runtime = new Runtime(renderer, new World(), state.current.viewport, controllers);
    state.current.runtime = runtime;

    let em: any = undefined;
    if (containerRef && containerRef.current) {
      em = new BrowserEventManager(containerRef.current, runtime);
      state.current.em = em;
    }

    return () => {
      controllers.forEach((controller) => {
        controller.stop(runtime);
      });
      runtime.stop();
      if (em) {
        em.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (state.current && state.current.runtime) {
      const rt = state.current.runtime;
      if (resetWorldOnChange) {
        return rt.world.addLayoutSubscriber((type) => {
          if (type === 'recalculate-world-size') {
            rt.goHome(cover);
          }
        });
      }
    }
    return () => {
      // no-op
    };
  }, [cover, resetWorldOnChange]);

  useLayoutEffect(() => {
    ReactAtlas.render(
      <Canvas>
        <ModeContext.Provider value={mode}>
          <AtlasContext.Provider value={state.current as any}>{children}</AtlasContext.Provider>
        </ModeContext.Provider>
      </Canvas>,
      state.current.runtime
    );
  }, [state, mode, children]);

  return {
    loading: !imageUrl && ready,
    uri: imageUrl,
    imageError,
  };
};
