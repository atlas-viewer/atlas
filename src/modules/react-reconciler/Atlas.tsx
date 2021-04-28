import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { World } from '../../world';
import { ReactAtlas } from './reconciler';
import { CanvasRenderer } from '../canvas-renderer/canvas-renderer';
import { Runtime, ViewerMode } from '../../renderer/runtime';
import { popmotionController, PopmotionControllerConfig } from '../popmotion-controller/popmotion-controller';
import { ModeContext } from './hooks/use-mode';
import useMeasure from 'react-use-measure';
import { AtlasContext, AtlasContextType } from './components/AtlasContext';
import { BrowserEventManager } from '../browser-event-manager/browser-event-manager';
import { WebGLRenderer } from '../webgl-renderer/webgl-renderer';
import { CompositeRenderer } from '../composite-renderer/composite-renderer';
import { OverlayRenderer } from '../overlay-renderer/overlay-renderer';

type AtlasProps = {
  width: number;
  height: number;
  mode?: ViewerMode;
  onCreated?: (ctx: AtlasContextType) => void | Promise<void>;
  resetWorldOnChange?: boolean;
  unstable_webglRenderer?: boolean;
  controllerConfig?: PopmotionControllerConfig;
};

export const Atlas: React.FC<AtlasProps> = ({
  onCreated,
  mode = 'explore',
  resetWorldOnChange = true,
  // eslint-disable-next-line
  unstable_webglRenderer = false,
  controllerConfig,
  children,
  ...restProps
}) => {
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
  const [ref, bounds] = useMeasure({ scroll: true });

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

  // This holds the class name for the container. This is changes when the
  // editing mode changes.
  const [containerClassName, setContainerClassName] = useState('');

  // This changes the mutable state object with the position (top/left/width/height) of the
  // canvas element on the page. This is used in the editing tools such as BoxDraw for comparing
  // positions.
  useEffect(() => {
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
        if (state.current.runtime) {
          state.current.runtime.goHome();
        }
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

    const controller = popmotionController({
      minZoomFactor: 0.5,
      maxZoomFactor: 3,
      enableClickToZoom: false,
      ...(controllerConfig || {}),
    });
    state.current.controller = controller;

    const renderer = new CompositeRenderer([
      // eslint-disable-next-line @typescript-eslint/camelcase
      unstable_webglRenderer ? new WebGLRenderer(currentCanvas) : new CanvasRenderer(currentCanvas, { debug: false }),
      overlayRef.current ? new OverlayRenderer(overlayRef.current) : undefined,
    ]);
    state.current.renderer = renderer;

    const runtime = new Runtime(renderer, new World(1024, 1024), state.current.viewport, [controller]);
    state.current.runtime = runtime;

    const em = new BrowserEventManager(currentCanvas, runtime);
    state.current.em = em;

    return () => {
      controller.stop(runtime);
      runtime.stop();
      em.stop();
    };
  }, []);

  useEffect(() => {
    if (state.current && state.current.runtime) {
      const rt = state.current.runtime;
      if (resetWorldOnChange) {
        return rt.world.addLayoutSubscriber(type => {
          if (type === 'recalculate-world-size') {
            rt.goHome();
          }
        });
      }
    }
    return () => {
      // no-op
    };
  }, [resetWorldOnChange]);

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

  // @todo move to controller.
  useEffect(() => {
    const keyupSpace = () => {
      if (state.current.runtime && state.current.runtime.mode === 'explore') {
        state.current.runtime.mode = 'sketch';
        setContainerClassName('mode-sketch');
      }
      window.removeEventListener('keyup', keyupSpace);
    };

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && state.current.runtime && state.current.runtime.mode === 'sketch') {
        if (e.target && (e.target as any).tagName && (e.target as any).tagName.toLowerCase() === 'input') return;
        e.preventDefault();
        state.current.runtime.mode = 'explore';
        setContainerClassName('mode-explore');
        window.addEventListener('keyup', keyupSpace);
      }
    });

    return () => {
      // no-op
    };
  });

  return (
    <div
      ref={ref}
      className={containerClassName}
      style={{
        position: 'relative',
        userSelect: 'none',
        display: 'inline-block',
        background: '#000',
        width: restProps.width,
        height: restProps.height,
        zIndex: 10,
        touchAction: 'none',
      }}
    >
      <style>{`
        .mode-explore { 
           cursor: move; /* fallback if grab cursor is unsupported */
           cursor: grab;
           cursor: -moz-grab;
           cursor: -webkit-grab;
         }
        .mode-explore:active { 
          cursor: grabbing;
          cursor: -moz-grabbing;
          cursor: -webkit-grabbing;
        }
      `}</style>
      <canvas {...restProps} ref={canvasRef as any} />
      <div style={{ position: 'absolute', top: 0, left: 0 }} ref={overlayRef as any} />
    </div>
  );
};
