import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { World } from '../../world';
import { ReactAtlas } from './reconciler';
import { CanvasRenderer } from '../canvas-renderer/canvas-renderer';
import { Runtime, ViewerMode } from '../../renderer/runtime';
import { supportedEventMap } from '../../events';
import { distance } from '@popmotion/popcorn';
import { popmotionController } from '../popmotion-controller/popmotion-controller';
import { ModeContext } from './hooks/use-mode';
import useMeasure from 'react-use-measure';
import { AtlasContext, AtlasContextType } from './components/AtlasContext';
import { BrowserEventManager } from '../browser-event-manager/browser-event-manager';

type AtlasProps = {
  width: number;
  height: number;
  mode?: ViewerMode;
  onCreated?: (ctx: AtlasContextType) => void | Promise<void>;
};

const eventPool = {
  atlas: { x: 0, y: 0 },
};

export const Atlas: React.FC<AtlasProps> = ({ onCreated, mode = 'explore', children, ...restProps }) => {
  // Reference to the current HTML Canvas element
  // Set by React by passing <canvas ref={...} />
  // Used to instantiate the controller and viewer with the correct HTML element.
  const canvasRef = useRef<HTMLCanvasElement>();

  // Holds a list of currently moused over elements.
  // When the pointer moves, this list is updated.
  // In Atlas, when a point move event is dispatched to the world a list of the items
  // that were under the pointer are returned. If during that handler an item is not
  // in this list, then a "mouseIn" event is dispatched to it. If it was in this list
  // and in the list returned then no additional event is dispatched. If it was in the list
  // but not moused over anymore, then the "mouseOut" event is dispatched.
  const mousedOver = useRef<any[]>([]);

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
    lastTouches: [],
  });

  // This holds the class name for the container. This is changes when the
  // editing mode changes.
  const [containerClassName, setContainerClassName] = useState('');

  // This changes the mutable state object with the position (top/left/width/height) of the
  // canvas element on the page. This is used in the editing tools such as BoxDraw for comparing
  // positions.
  useEffect(() => {
    state.current.canvasPosition = bounds;
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
      rt.goHome();
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
        rt._updateScaleFactor();
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

    const controller = popmotionController(currentCanvas, {
      minZoomFactor: 0.5,
      maxZoomFactor: 3,
      enableClickToZoom: true,
    });
    state.current.controller = controller;

    const renderer = new CanvasRenderer(currentCanvas, overlayRef.current, { debug: false });
    state.current.renderer = renderer;

    const runtime = new Runtime(renderer, new World(0, 0), state.current.viewport, [controller]);
    state.current.runtime = runtime;

    const em = new BrowserEventManager(currentCanvas, runtime);
    state.current.em = em;

    return () => {
      controller.stop(runtime);
      runtime.stop();
      em.stop();
    };
  }, []);

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

  //
  //
  //
  //
  //
  //                         START EVENTS
  //
  //
  //
  //
  //

  // @todo move most of this to runtime?
  const handlePointMove = useCallback(
    (e: any) => {
      if (!state.current.runtime) {
        return;
      }

      // Convert the page co-ordinate space to the units relative to the viewer.
      const { x, y } = state.current.runtime.viewerToWorld(e.pageX - bounds.left, e.pageY - bounds.top);

      // Here we are updating out synthetic event. This is not elegant.
      eventPool.atlas.x = x;
      eventPool.atlas.y = y;
      e.atlas = eventPool.atlas;

      // First we propagate the pointer and mouse move event to the world.
      state.current.runtime.world.propagatePointerEvent('onPointerMove', e, x, y);
      const newList = state.current.runtime.world.propagatePointerEvent('onMouseMove', e, x, y);

      // This is where we handle mouse enter and mouse leave events. This could be
      // stored and handled inside of the world.
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

      if (state.current.runtime.world.pointerEventState.isDragging) {
        for (const item of state.current.runtime.world.pointerEventState.itemsBeingDragged) {
          item.dispatchEvent('onDrag', e);
        }
        // @todo take the results of this and do a drag-over.
      }

      if (
        state.current.runtime.world.pointerEventState.isPressed &&
        !state.current.runtime.world.pointerEventState.isDragging &&
        distance(state.current.runtime.world.pointerEventState.mouseDownStart, { x: e.pageX, y: e.pageY }) > 50
      ) {
        const dragStart = state.current.runtime.viewerToWorld(
          state.current.runtime.world.pointerEventState.mouseDownStart.x - bounds.left,
          state.current.runtime.world.pointerEventState.mouseDownStart.y - bounds.top
        );
        state.current.runtime.world.pointerEventState.isDragging = true;
        state.current.runtime.world.pointerEventState.itemsBeingDragged = state.current.runtime.world.propagatePointerEvent(
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

  const handleTouchEvent = (e: React.TouchEvent & { atlasTargetTouches?: any[]; atlasTouches?: any[] }) => {
    if (!state.current.runtime) {
      return;
    }
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

  // @todo can this be simplified?
  const handlePointerEvent: React.PointerEventHandler | React.MouseEventHandler | React.WheelEventHandler = useCallback(
    (e: any) => {
      if (!state.current.runtime) {
        return;
      }

      const ev = supportedEventMap[e.type as any];
      if (ev && state.current.runtime.world.activatedEvents.indexOf(ev) !== -1) {
        const { x, y } = state.current.runtime.viewerToWorld(e.pageX - bounds.left, e.pageY - bounds.top);
        state.current.runtime.world.propagatePointerEvent(ev as any, e, x, y);
      }
    },
    [bounds.left, bounds.top]
  );

  const handleMouseDown = useCallback(
    e => {
      if (!state.current.runtime) {
        return;
      }
      e.persist();
      state.current.runtime.world.pointerEventState.isPressed = true;
      state.current.runtime.world.pointerEventState.isClicking = true;
      state.current.runtime.world.pointerEventState.mouseDownStart.x = e.pageX;
      state.current.runtime.world.pointerEventState.mouseDownStart.y = e.pageY;
      setTimeout(() => {
        if (state.current.runtime) {
          state.current.runtime.world.pointerEventState.isClicking = false;
        }
      }, 200);
      setTimeout(() => {
        if (
          state.current.runtime &&
          state.current.runtime.world.pointerEventState.isPressed &&
          !state.current.runtime.world.pointerEventState.isDragging
        ) {
          const dragStart = state.current.runtime.viewerToWorld(
            state.current.runtime.world.pointerEventState.mouseDownStart.x - bounds.left,
            state.current.runtime.world.pointerEventState.mouseDownStart.y - bounds.top
          );
          state.current.runtime.world.pointerEventState.isDragging = true;
          state.current.runtime.world.pointerEventState.itemsBeingDragged = state.current.runtime.world.propagatePointerEvent(
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
      if (!state.current.runtime) {
        return;
      }

      if (state.current.runtime.world.pointerEventState.isClicking) {
        const { x, y } = state.current.runtime.viewerToWorld(e.pageX - bounds.left, e.pageY - bounds.top);

        eventPool.atlas.x = x;
        eventPool.atlas.y = y;
        e.atlas = eventPool.atlas;

        state.current.runtime.world.propagatePointerEvent('onClick', e, x, y);
      }

      if (state.current.runtime.world.pointerEventState.isDragging) {
        for (const item of state.current.runtime.world.pointerEventState.itemsBeingDragged) {
          item.dispatchEvent('onDragEnd', e);
        }
        state.current.runtime.world.pointerEventState.isDragging = false;
      }
      state.current.runtime.world.pointerEventState.isClicking = false;
      state.current.runtime.world.pointerEventState.isPressed = false;
      state.current.runtime.world.pointerEventState.itemsBeingDragged = [];
      handlePointerEvent(e);
    },
    [bounds, handlePointerEvent]
  );

  // End events

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
