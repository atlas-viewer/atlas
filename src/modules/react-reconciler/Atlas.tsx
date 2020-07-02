import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Strand } from '@atlas-viewer/dna';
import { RuntimeController } from '../../types';
import { ReactAtlas } from './reconciler';
import { CanvasRenderer } from '../canvas-renderer/canvas-renderer';
import { Runtime } from '../../renderer/runtime';
import { Paintable } from '../../world-objects/paint';
import { render } from 'react-dom';
import { Box } from '../../objects/box';
import { supportedEventMap } from '../../events';
import { distance } from '@popmotion/popcorn';
import { popmotionController } from '../popmotion-controller/popmotion-controller';

const AtlasContext = React.createContext<
  | {
      runtime: Runtime;
      canvas: { current: HTMLCanvasElement };
      mode: { current: ViewerMode };
    }
  | undefined
>(undefined);

type AtlasProps = {
  width: number;
  height: number;
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

export type ViewerMode = 'static' | 'explore' | 'sketch' | 'sketch-explore';

export function useMode() {
  const { mode: currentMode } = useAtlas();
  const setMode = (mode: 'static' | 'explore' | 'sketch' | 'sketch-explore') => {
    currentMode.current = mode;
    // @todo implement
  };

  return [currentMode, setMode] as const;
}

export function canDrag(ref: { current: ViewerMode }) {
  return ref.current === 'sketch';
}

export const useFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useFrame', callback);
  }, deps);
};

export const useBeforeFrame = (callback: (time: number) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useBeforeFrame', callback);
  }, []);
};

export const useAfterPaint = (callback: (paint: Paintable) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useAfterPaint', callback);
  }, []);
};

export const useAfterFrame = (callback: (time: number) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useAfterFrame', callback);
  }, []);
};

export const useCanvas = () => {
  const { canvas } = useAtlas();
  return canvas.current;
};

export const HTMLPortal: React.FC<{
  backgroundColor?: string;
  interactive?: boolean;
  target?: { x: number; y: number; width: number; height: number };
}> = ({ children, ...props }) => {
  const boxRef = useRef<Box>();

  useEffect(() => {
    const box = boxRef.current;
    if (box && box.__host) {
      render(children as any, box.__host.element);
    }
  }, [children, boxRef]);

  return <box {...props} ref={boxRef} />;
};

const eventPool = {
  atlas: { x: 0, y: 0 },
};

export const Atlas: React.FC<AtlasProps> = ({ onCreated, children, ...restProps }) => {
  const canvasRef = useRef<HTMLCanvasElement>();
  const mousedOver = useRef<any[]>([]);
  const overlayRef = useRef<HTMLDivElement>();
  const mode = useRef<ViewerMode>('static');
  const [ready, setReady] = useState(false);
  const state: React.MutableRefObject<RuntimeContext> = useRef<any>({
    mode,
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
    if (state.current.runtime) {
      const rt: Runtime = state.current.runtime;

      rt.resize(state.current.viewport.width, restProps.width, state.current.viewport.height, restProps.height);
      rt.goHome();
      state.current.viewport.width = restProps.width;
      state.current.viewport.height = restProps.height;
    }
  }, [restProps.width, restProps.height]);

  useLayoutEffect(() => {
    const currentCanvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!currentCanvas || !overlay) return;
    const dimensions = currentCanvas.getBoundingClientRect();
    overlay.style.width = `${dimensions.width}px`;
    overlay.style.height = `${dimensions.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
  });

  const Canvas = useCallback(function Canvas(props: { children: React.ReactElement }): JSX.Element {
    const activate = () => setReady(true);

    useEffect(() => {
      const result = onCreated && onCreated(state.current);
      return void (result && result.then ? result.then(activate) : activate());
    }, []);

    return props.children;
  }, []);

  const handlePointMove = useCallback((e: any) => {
    const { x, y } = state.current.runtime.viewerToWorld(
      e.pageX - state.current.canvasPosition.left,
      e.pageY - state.current.canvasPosition.top
    );

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
        state.current.clickStart.x - state.current.canvasPosition.left,
        state.current.clickStart.y - state.current.canvasPosition.top
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
  }, []);

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
    currentCanvas.style.userSelect = 'none';

    state.current.controller = popmotionController(currentCanvas, {
      minZoomFactor: 0.5,
      maxZoomFactor: 10,
      enableClickToZoom: true,
    });
    state.current.renderer = new CanvasRenderer(currentCanvas, overlayRef.current, { debug: false });
    state.current.runtime = new Runtime(state.current.renderer, new World(0, 0), state.current.viewport, [
      state.current.controller,
    ]);
    state.current.canvasPosition = currentCanvas.getBoundingClientRect();

    ReactAtlas.render(
      <Canvas>
        <AtlasContext.Provider value={state.current}>{children}</AtlasContext.Provider>
      </Canvas>,
      state.current.runtime
    );
  }, []);

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
      const { x, y } = state.current.runtime.viewerToWorld(
        touch.pageX - state.current.canvasPosition.left,
        touch.pageY - state.current.canvasPosition.top
      );

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

  const handlePointerEvent: React.PointerEventHandler | React.MouseEventHandler | React.WheelEventHandler = (
    e: any
  ) => {
    const ev = supportedEventMap[e.type as any];
    if (ev && state.current.runtime.world.activatedEvents.indexOf(ev) !== -1) {
      const { x, y } = state.current.runtime.viewerToWorld(
        e.pageX - state.current.canvasPosition.left,
        e.pageY - state.current.canvasPosition.top
      );
      state.current.runtime.world.propagatePointerEvent(ev, e, x, y);
    }
  };

  const stubbedUiEvent: React.UIEventHandler = e => {
    // console.log(e);
  };

  const stubbedWheelEvent: React.WheelEventHandler = e => {
    // console.log(e);
  };

  const stubbedDragEvent: React.DragEventHandler = e => {
    // Drag over
    // Drag enter
    // Drag exit
  };

  const handleMouseDown = useCallback(e => {
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
          state.current.clickStart.x - state.current.canvasPosition.left,
          state.current.clickStart.y - state.current.canvasPosition.top
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
  }, []);

  const handleMouseUp: React.PointerEventHandler = useCallback((e: any) => {
    if (state.current.click) {
      const { x, y } = state.current.runtime.viewerToWorld(
        e.pageX - state.current.canvasPosition.left,
        e.pageY - state.current.canvasPosition.top
      );

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
  }, []);

  useEffect(() => {
    const keyupSpace = () => {
      if (state.current.runtime.mode === 'explore') {
        console.log('setting runtime mode to sketch');
        state.current.runtime.mode = 'sketch';
        setContainerClassName('mode-sketch');
      }
      window.removeEventListener('keyup', keyupSpace);
    };

    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && state.current.runtime.mode === 'sketch') {
        console.log('setting runtime mode to explore');
        state.current.runtime.mode = 'explore';
        setContainerClassName('mode-explore');
        window.addEventListener('keyup', keyupSpace);
      }
    });

    return () => {};
  });

  return (
    <div
      className={containerClassName}
      style={{
        position: 'relative',
        userSelect: 'none',
        display: 'inline-block',
        background: '#000',
        borderRadius: 5,
        overflow: 'hidden',
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
        // UI Events.
        onScroll={stubbedUiEvent}
        // Wheel events.
        onWheel={handlePointerEvent as any}
        ref={canvasRef as any}
      />
      <div style={{ position: 'absolute', top: 0, left: 0 }} ref={overlayRef as any} />
    </div>
  );
};
