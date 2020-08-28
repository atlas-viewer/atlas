import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Strand } from '@atlas-viewer/dna';
import { RuntimeController } from '../../types';
import { ReactAtlas } from './reconciler';
import { CanvasRenderer } from '../canvas-renderer/canvas-renderer';
import { Runtime, ViewerMode } from '../../renderer/runtime';
import { Paintable } from '../../world-objects/paint';
import { supportedEventMap } from '../../events';
import { distance } from '@popmotion/popcorn';
import { popmotionController } from '../popmotion-controller/popmotion-controller';
import { ModeContext } from './hooks/use-mode';
import useMeasure from 'react-use-measure';

const AtlasContext = React.createContext<
  | {
      runtime: Runtime;
      canvasPosition: ClientRect;
      canvas: { current: HTMLCanvasElement };
      mode: { current: ViewerMode };
      ready: boolean;
    }
  | undefined
>(undefined);

type AtlasProps = {
  width: number;
  height: number;
  mode?: ViewerMode;
  onCreated?: (ctx: RuntimeContext) => void | Promise<void>;
};

type RuntimeContext = any;

type _RuntimeContext = {
  renderer: Renderer;
  world: World;
  target: Strand;
  aggregate: Strand;
  scaleFactor: number;
  transformBuffer: Strand;
  lastTarget: Strand;
  pendingUpdate: boolean;
  firstRender: boolean;
  lastTime: number;
  stopId?: number;
  controllers: RuntimeController[];
  controllersRunning: boolean;
};

export const useAtlas = () => {
  const ctx = useContext(AtlasContext);

  if (typeof ctx === 'undefined') {
    throw new Error('Cannot useAtlas outside of Atlas component');
  }

  return ctx;
};

export const useRuntime = () => {
  const { runtime } = useAtlas();
  return runtime;
};

export function canDrag(ref: { current: ViewerMode }) {
  return ref.current === 'sketch';
}

export const useFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useFrame', callback);
  }, deps);
};

export const useBeforeFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useBeforeFrame', callback);
  }, deps);
};

export const useAfterPaint = (callback: (paint: Paintable) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useAfterPaint', callback);
  }, deps);
};

export const useAfterFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useAfterFrame', callback);
  }, deps);
};

export const useCanvas = () => {
  const { canvas } = useAtlas();
  return canvas.current;
};

const eventPool = {
  atlas: { x: 0, y: 0 },
};

export const Atlas: React.FC<AtlasProps> = ({ onCreated, mode = 'explore', children, ...restProps }) => {
  const canvasRef = useRef<HTMLCanvasElement>();
  const mousedOver = useRef<any[]>([]);
  const overlayRef = useRef<HTMLDivElement>();
  const [ready, setReady] = useState(false);
  const [ref, bounds] = useMeasure({ scroll: true });
  const state: React.MutableRefObject<RuntimeContext> = useRef<any>({
    ready: ready,
    viewport: { width: restProps.width, height: restProps.height, x: 0, y: 0, scale: 1 },
    renderer: undefined,
    runtime: undefined,
    click: false,
    drag: false,
    pressed: false,
    dragTimeout: 0,
    dragItems: [],
    controller: undefined,
    canvas: canvasRef,
    canvasPosition: undefined,
    lastTouches: [],
    clickStart: { x: 0, y: 0 },
  });
  const [containerClassName, setContainerClassName] = useState('');

  useEffect(() => {
    state.current.canvasPosition = bounds;
  }, [bounds]);

  useEffect(() => {
    if (state.current) {
      state.current.runtime.mode = mode;
    }
  }, [state, mode]);

  useEffect(() => {
    if (state.current.runtime) {
      const rt: Runtime = state.current.runtime;

      rt.resize(state.current.viewport.width, restProps.width, state.current.viewport.height, restProps.height);
      rt.goHome();
      state.current.viewport.width = restProps.width;
      state.current.viewport.height = restProps.height;
      rt.pendingUpdate = true;
    }
  }, [restProps.width, restProps.height]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
  }, [bounds.height, bounds.width]);

  useLayoutEffect(() => {
    const windowResizeCallback = () => {
      if (state.current.runtime) {
        const rt: Runtime = state.current.runtime;

        rt.resize(state.current.viewport.width, restProps.width, state.current.viewport.height, restProps.height);
        rt._updateScaleFactor();
        state.current.viewport.width = restProps.width;
        state.current.viewport.height = restProps.height;
        rt.pendingUpdate = true;
      }
    };

    window.addEventListener('resize', windowResizeCallback);

    return () => window.removeEventListener('resize', windowResizeCallback);
  }, [restProps.height, restProps.width]);

  // @todo what does this do?
  const Canvas = useCallback(
    function Canvas(props: { children: React.ReactElement }): JSX.Element {
      const activate = () => setReady(true);

      useEffect(() => {
        const result = onCreated && onCreated(state.current);
        return void (result && result.then ? result.then(activate) : activate());
      }, []);

      return props.children;
    },
    [onCreated]
  );

  // @todo move most of this to runtime?
  const handlePointMove = useCallback(
    (e: any) => {
      console.log();
      const { x, y } = state.current.runtime.viewerToWorld(e.pageX - bounds.left, e.pageY - bounds.top);

      eventPool.atlas.x = x;
      eventPool.atlas.y = y;
      e.atlas = eventPool.atlas;
      state.current.runtime.world.propagatePointerEvent('onPointerMove', e, x, y);
      const newList = state.current.runtime.world.propagatePointerEvent('onMouseMove', e, x, y);
      const newIds = [];
      const newItems = [];
      for (const item of newList) {
        newIds.push(item.id);
        newItems.push(item);
        if (mousedOver.current.indexOf(item) === -1) {
          item.dispatchEvent('onMouseEnter', e);
          item.dispatchEvent('onPointerEnter', e);
        }
      }
      for (const oldItem of mousedOver.current) {
        if (newIds.indexOf(oldItem.id) === -1) {
          oldItem.dispatchEvent('onMouseLeave', e);
          oldItem.dispatchEvent('onPointerLeave', e);
        }
      }

      if (state.current.drag) {
        for (const item of state.current.dragItems) {
          item.dispatchEvent('onDrag', e);
        }
        // @todo take the results of this and do a drag-over.
      }

      if (
        state.current.pressed &&
        !state.current.drag &&
        distance(state.current.clickStart, { x: e.pageX, y: e.pageY }) > 50
      ) {
        const dragStart = state.current.runtime.viewerToWorld(
          state.current.clickStart.x - bounds.left,
          state.current.clickStart.y - bounds.top
        );
        state.current.drag = true;
        state.current.dragItems = state.current.runtime.world.propagatePointerEvent(
          'onDragStart',
          { ...e, atlas: { x: dragStart.x, y: dragStart.y } },
          dragStart.x,
          dragStart.y
        );
      }
      mousedOver.current = newItems;
    },
    [bounds.left, bounds.top]
  );

  const handleMouseLeave: React.MouseEventHandler = useCallback(e => {
    for (const oldItem of mousedOver.current) {
      oldItem.dispatchEvent('onMouseLeave', e);
    }
    mousedOver.current = [];
  }, []);

  // Render v-dom into scene
  useLayoutEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) {
      throw new Error('Something went wrong mounting canvas.');
    }

    // @todo move this out.
    currentCanvas.style.userSelect = 'none';

    state.current.controller = popmotionController(currentCanvas, {
      minZoomFactor: 0.5,
      maxZoomFactor: 3,
      enableClickToZoom: false,
    });
    state.current.renderer = new CanvasRenderer(currentCanvas, overlayRef.current, { debug: false });
    state.current.runtime = new Runtime(state.current.renderer, new World(0, 0), state.current.viewport, [
      state.current.controller,
    ]);

    return () => {
      if (state.current) {
        state.current.controller.stop(state.current.runtime);
        state.current.runtime.stop();
      }
    };
  }, []);

  useLayoutEffect(() => {
    ReactAtlas.render(
      <Canvas>
        <ModeContext.Provider value={mode}>
          <AtlasContext.Provider value={state.current}>{children}</AtlasContext.Provider>
        </ModeContext.Provider>
      </Canvas>,
      state.current.runtime
    );
  }, [state, mode, children]);

  const handleTouchEvent = (e: React.TouchEvent & { atlasTargetTouches?: any[]; atlasTouches?: any[] }) => {
    const type = supportedEventMap[e.type as any];
    if (!type || state.current.runtime.world.activatedEvents.indexOf(type) === -1) {
      return;
    }
    const atlasTouches = [];
    // const atlasTargetTouches = [];
    const len = e.touches.length;
    for (let i = 0; i < len; i++) {
      const touch = e.touches.item(i);
      if (!touch) continue;
      const { x, y } = state.current.runtime.viewerToWorld(touch.pageX - bounds.left, touch.pageY - bounds.top);

      const atlasTouch = { id: touch.identifier, x, y };

      atlasTouches.push(atlasTouch);
    }

    if (type !== 'onTouchEnd') {
      state.current.lastTouches = atlasTouches;
      e.atlasTouches = atlasTouches;
      state.current.runtime.world.propagateTouchEvent(type, e as any, atlasTouches);
    } else {
      e.atlasTouches = [];
      state.current.runtime.world.propagateTouchEvent(type, e as any, state.current.lastTouches);
      state.current.lastTouches = [];
    }

    e.atlasTouches = atlasTouches;
    state.current.runtime.world.propagateTouchEvent(type, e as any, atlasTouches);
  };

  const handlePointerEvent: React.PointerEventHandler | React.MouseEventHandler | React.WheelEventHandler = useCallback(
    (e: any) => {
      const ev = supportedEventMap[e.type as any];
      if (ev && state.current.runtime.world.activatedEvents.indexOf(ev) !== -1) {
        const { x, y } = state.current.runtime.viewerToWorld(e.pageX - bounds.left, e.pageY - bounds.top);
        state.current.runtime.world.propagatePointerEvent(ev, e, x, y);
      }
    },
    [bounds.left, bounds.top]
  );

  const handleMouseDown = useCallback(
    e => {
      e.persist();
      state.current.pressed = true;
      state.current.click = true;
      state.current.clickStart.x = e.pageX;
      state.current.clickStart.y = e.pageY;
      setTimeout(() => {
        state.current.click = false;
      }, 200);
      state.current.dragTimeout = setTimeout(() => {
        if (state.current.pressed && !state.current.drag) {
          const dragStart = state.current.runtime.viewerToWorld(
            state.current.clickStart.x - bounds.left,
            state.current.clickStart.y - bounds.top
          );
          state.current.drag = true;
          state.current.dragItems = state.current.runtime.world.propagatePointerEvent(
            'onDragStart',
            e,
            dragStart.x,
            dragStart.y
          );
        }
      }, 600);
      handlePointerEvent(e);
    },
    [bounds.left, bounds.top, handlePointerEvent]
  );

  const handleMouseUp: React.PointerEventHandler = useCallback(
    (e: any) => {
      if (state.current.click) {
        const { x, y } = state.current.runtime.viewerToWorld(e.pageX - bounds.left, e.pageY - bounds.top);

        eventPool.atlas.x = x;
        eventPool.atlas.y = y;
        e.atlas = eventPool.atlas;

        state.current.runtime.world.propagatePointerEvent('onClick', e, x, y);
      }

      if (state.current.drag) {
        for (const item of state.current.dragItems) {
          item.dispatchEvent('onDragEnd', e);
        }
        state.current.drag = false;
      }
      state.current.click = false;
      state.current.pressed = false;
      state.current.dragItems = [];
      handlePointerEvent(e);
    },
    [bounds, handlePointerEvent]
  );

  useEffect(() => {
    const keyupSpace = () => {
      if (state.current.runtime.mode === 'explore') {
        state.current.runtime.mode = 'sketch';
        setContainerClassName('mode-sketch');
      }
      window.removeEventListener('keyup', keyupSpace);
    };

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && state.current.runtime.mode === 'sketch') {
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
      <canvas
        {...restProps}
        // Mouse events.
        onMouseDown={handlePointerEvent as any}
        onMouseEnter={handlePointerEvent as any}
        onMouseLeave={handlePointerEvent as any}
        onMouseMove={handlePointerEvent as any}
        onMouseOut={handlePointerEvent as any} // Mouse out - bubbles and is cancellable
        onMouseOver={handlePointerEvent as any} // Mouse over - bubbles and cancellable
        onMouseUp={handlePointerEvent as any}
        // Touch events.
        onTouchCancel={handleTouchEvent}
        onTouchEnd={handleTouchEvent}
        onTouchMove={handleTouchEvent}
        onTouchStart={handleTouchEvent}
        // Pointer events.
        onPointerDown={handleMouseDown}
        onPointerMove={handlePointMove}
        onPointerUp={handleMouseUp}
        onPointerCancel={handlePointerEvent as any}
        onPointerEnter={handlePointerEvent as any}
        onPointerLeave={handleMouseLeave as any}
        onPointerOver={handlePointerEvent as any}
        onPointerOut={handlePointerEvent as any}
        // Wheel events.
        onWheel={handlePointerEvent as any}
        ref={canvasRef as any}
      />
      <div style={{ position: 'absolute', top: 0, left: 0 }} ref={overlayRef as any} />
    </div>
  );
};
