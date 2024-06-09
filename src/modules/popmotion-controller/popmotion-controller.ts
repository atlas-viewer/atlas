/** @ts-ignore */
import normalizeWheel from 'normalize-wheel';
import { distance } from '../../utils';
import { compose, dna, scale, scaleAtOrigin, transform, translate } from '@atlas-viewer/dna';
import { RuntimeController } from '../../types';
import { easingFunctions } from '../../utility/easing-functions';
import { toBox } from '../../utility/to-box';

const INTENT_PAN = 'pan';
const INTENT_SCROLL = 'scroll';
const INTENT_GESTURE = 'gesture';

export type PopmotionControllerConfig = {
  zoomOutFactor?: number;
  zoomInFactor?: number;
  maxZoomFactor?: number;
  minZoomFactor?: number;
  zoomDuration?: number;
  zoomClamp?: number;
  zoomWheelConstant?: number;
  panBounceStiffness?: number;
  panBounceDamping?: number;
  panTimeConstant?: number;
  panPower?: number;
  nudgeDistance?: number;
  panPadding?: number;
  devicePixelRatio?: number;
  enableWheel?: boolean;
  enableClickToZoom?: boolean;
  debug?: boolean;
  ignoreSingleFingerTouch?: boolean;
  enablePanOnWait?: boolean;
  panOnWaitDelay?: number;
  parentElement?: HTMLElement | null;
  onPanInSketchMode?: () => void;
};

export const defaultConfig: Required<PopmotionControllerConfig> = {
  // Zoom options
  zoomOutFactor: 0.8,
  zoomInFactor: 1.25,
  maxZoomFactor: 1,
  minZoomFactor: 0.05,
  zoomDuration: 300,
  zoomWheelConstant: 20, // 30 = OSD
  // zoomWheelConstant: 15, // 15 = fast
  // zoomWheelConstant: 18,
  zoomClamp: 0.6,
  // Pan options.
  panBounceStiffness: 120,
  panBounceDamping: 15,
  panTimeConstant: 240,
  panPower: 0.1,
  nudgeDistance: 100,
  panPadding: 0,
  devicePixelRatio: 1,
  // Flags
  enableWheel: true,
  enableClickToZoom: true,
  ignoreSingleFingerTouch: true,
  enablePanOnWait: true,
  panOnWaitDelay: 40,
  debug: true,
  onPanInSketchMode: () => {
    // no-op
  },
  parentElement: null,
};

export const popmotionController = (config: PopmotionControllerConfig = {}): RuntimeController => {
  return {
    start: function (runtime) {
      const {
        zoomWheelConstant,
        enableWheel,
        enableClickToZoom,
        ignoreSingleFingerTouch,
        enablePanOnWait,
        panOnWaitDelay,
        debug,
        parentElement,
      } = {
        ...defaultConfig,
        ...config,
      };

      const state = {
        pointerStart: { x: 0, y: 0 },
        isPressing: false,
        mousemoveBuffer: dna(5),
        multiTouch: {
          distance: 0,
        },
      };

      runtime.world.activatedEvents.push(
        // List of events we are supporting.
        'onMouseUp',
        'onMouseDown',
        'onMouseMove',
        'onTouchStart',
        'onTouchEnd',
        'onTouchMove',
        'onPointerUp',
        'onPointerDown',
        'onPointerMove'
      );

      //  el.onpointerdown = pointerdown_handler;
      //  el.onpointermove = pointermove_handler;
      //
      //  // Use same handler for pointer{up,cancel,out,leave} events since
      //  // the semantics for these events - in this app - are the same.
      //  el.onpointerup = pointerup_handler;
      //  el.onpointercancel = pointerup_handler;
      //  el.onpointerout = pointerup_handler;
      //  el.onpointerleave = pointerup_handler;
      const eventCache: PointerEvent[] = [];
      const atlasPointsCache: any[] = [];
      let prevDiff = -1;
      function removeFromEventCache(e: PointerEvent) {
        // Remove this event from the target's cache
        for (let i = 0; i < eventCache.length; i++) {
          if (eventCache[i].pointerId == e.pointerId) {
            eventCache.splice(i, 1);
            atlasPointsCache.splice(i, 1);
            break;
          }
        }
      }

      function pointerDown(e: PointerEvent) {
        eventCache.push(e);
        atlasPointsCache.push({ ...((e as any).atlas || {}) });
      }
      function pointerMove(e: PointerEvent) {
        for (let i = 0; i < eventCache.length; i++) {
          if (e.pointerId == eventCache[i].pointerId) {
            eventCache[i] = e;
            atlasPointsCache[i] = { ...((e as any).atlas || {}) };
            break;
          }
        }
        if (eventCache.length == 2) {
          const curDiff = Math.abs(eventCache[0].clientX - eventCache[1].clientX);

          // - - 2 - - 6- - - - 10
          const xDiff =
            atlasPointsCache[0].x > atlasPointsCache[1].x
              ? atlasPointsCache[0].x - atlasPointsCache[1].x
              : atlasPointsCache[1].x - atlasPointsCache[0].x;
          const yDiff =
            atlasPointsCache[0].y > atlasPointsCache[1].y
              ? atlasPointsCache[0].y - atlasPointsCache[1].y
              : atlasPointsCache[1].y - atlasPointsCache[0].y;

          if (prevDiff > 0) {
            if (curDiff > prevDiff) {
              runtime.world.zoomTo(
                // Generating a zoom from the wheel delta
                0.95,
                { x: xDiff / 2, y: yDiff / 2 },
                true
              );
            }
            if (curDiff < prevDiff) {
              runtime.world.zoomTo(
                // Generating a zoom from the wheel delta
                1.05,
                { x: xDiff / 2, y: yDiff / 2 },
                true
              );
            }
          }

          // Cache the distance for the next move event
          prevDiff = curDiff;
        }
      }

      function pointerUp(e: PointerEvent) {
        // Remove this pointer from the cache and reset the target's
        // background and border
        removeFromEventCache(e);
        // If the number of pointers down is less than two then reset diff tracker
        if (eventCache.length < 2) {
          prevDiff = -1;
        }
      }

      function resetState() {
        currentDistance = 0;
        intent = '';
        setDebugBorder();
        touchStartTime = 0;
      }

      function onMouseUp() {
        runtime.world.constraintBounds();
        resetState();
      }

      function onMouseDown(e: MouseEvent & { atlas: { x: number; y: number } }) {
        if (e.which > 1) {
          state.isPressing = false;
          return;
        }
        if (runtime.mode === 'explore') {
          e.preventDefault();
          state.pointerStart.x = e.atlas.x;
          state.pointerStart.y = e.atlas.y;

          runtime.transitionManager.stopTransition();

          state.isPressing = true;
        }
      }

      function onWindowMouseUp() {
        resetState();
        if (state.isPressing) {
          if (runtime.mode === 'explore') {
            runtime.world.constraintBounds();
          }
          state.isPressing = false;
        }
      }

      let currentDistance = 0;
      // the performance.now() time at 'touch-start'
      let touchStartTime = 0;
      // what the user's intent would be for the behavior
      let intent = '';
      function onTouchStart(e: TouchEvent & { atlasTouches: Array<{ id: number; x: number; y: number }> }) {
        if (runtime.mode === 'explore') {
          if (e.atlasTouches.length === 1) {
            touchStartTime = performance.now();
            if (ignoreSingleFingerTouch == false) {
              // this prevents the touch propagation to the window, and thus doesn't drag the page
              e.preventDefault();
            }
            state.pointerStart.x = e.atlasTouches[0].x;
            state.pointerStart.y = e.atlasTouches[0].y;
          }
          if (e.atlasTouches.length === 2) {
            intent = INTENT_GESTURE;
            e.preventDefault();
            const x1 = e.atlasTouches[0].x;
            const x2 = e.atlasTouches[1].x;
            state.pointerStart.x = (x1 + x2) / 2;
            const y1 = e.atlasTouches[0].y;
            const y2 = e.atlasTouches[1].y;
            state.pointerStart.y = (y1 + y2) / 2;

            currentDistance = distance(
              { x: e.touches[0].clientX, y: e.touches[0].clientY },
              { x: e.touches[1].clientX, y: e.touches[1].clientY }
            );
          }

          runtime.transitionManager.stopTransition();

          state.isPressing = true;
        }
      }

      function setDebugBorder(border = '1px solid transparent') {
        if (debug == false) {
          return;
        }
        const el = document.querySelector('.atlas') as HTMLElement;
        if (el) {
          el.style.border = border;
        }
      }

      function onTouchMove(e: TouchEvent & { atlasTouches: Array<{ id: number; x: number; y: number }> }) {
        let clientX = null;
        let clientY = null;
        let isMulti = false;
        let newDistance = 0;
        if (state.isPressing && e.touches.length === 2) {
          // We have 2?
          const x1 = e.touches[0].clientX;
          const x2 = e.touches[1].clientX;
          clientX = (x1 + x2) / 2;
          const y1 = e.touches[0].clientY;
          const y2 = e.touches[1].clientY;
          clientY = (y1 + y2) / 2;

          newDistance = distance(
            { x: e.touches[0].clientX, y: e.touches[0].clientY },
            { x: e.touches[1].clientX, y: e.touches[1].clientY }
          );
          isMulti = true;
          setDebugBorder('1px solid blue');
        }

        if (state.isPressing && e.touches.length === 1) {
          if (enablePanOnWait) {
            // if there is a delay between the touch-start and the 1st touch-move of < xms, then treat that as a PAN, 
            // anything faster is a window scroll
            if (performance.now() - touchStartTime < panOnWaitDelay && intent == '') {
              intent = INTENT_SCROLL;
              setDebugBorder('1px solid red');
            }
            if (intent == '') {
              setDebugBorder('1px solid green');
              intent = INTENT_PAN;
            }
          }
          // if we are ignoring a single finger touch, or it's a window-scroll, just 'return'
          if ((intent == '' && ignoreSingleFingerTouch == true) || intent == INTENT_SCROLL) {
            // have CanvasPanel do nothing... scroll the page
            return;
          }
          const touch = e.touches[0];
          clientX = touch.clientX;
          clientY = touch.clientY;
        }

        // Translate.
        if (clientX !== null && clientY !== null) {
          const bounds = runtime.getRendererScreenPosition();
          if (bounds) {
            const { x, y } = runtime.viewerToWorld(clientX - bounds.x, clientY - bounds.y);

            const deltaDistance = newDistance && currentDistance ? newDistance / currentDistance : 1;

            runtime.transitionManager.customTransition((pendingTransition) => {
              pendingTransition.from = dna(runtime.target);
              pendingTransition.to = transform(
                pendingTransition.from,
                compose(
                  translate(state.pointerStart.x - x, state.pointerStart.y - y),
                  scaleAtOrigin(1 / deltaDistance, x, y)
                ),
                state.mousemoveBuffer
              );
              pendingTransition.elapsed_time = 0;
              pendingTransition.total_time = 0;
              pendingTransition.timingFunction = easingFunctions.easeInOutExpo;
              pendingTransition.done = false;
            });
          }
          currentDistance = newDistance;
        }

        if (intent == INTENT_PAN) {
          // if we're panning, prevent default
          // this does the same thing as touchEvents: none; pointerEvents: none;
          e.preventDefault();
        }
      }

      function onMouseMove(e: MouseEvent | PointerEvent) {
        if (state.isPressing) {
          const bounds = runtime.getRendererScreenPosition();
          if (bounds) {
            const { x, y } = runtime.viewerToWorld(e.clientX - bounds.x, e.clientY - bounds.y);
            // const atlas = runtime.
            runtime.transitionManager.customTransition((pendingTransition) => {
              pendingTransition.from = dna(runtime.target);
              pendingTransition.to = transform(
                pendingTransition.from,
                translate(state.pointerStart.x - x, state.pointerStart.y - y),
                state.mousemoveBuffer
              );
              pendingTransition.elapsed_time = 0;
              pendingTransition.total_time = 0;
              pendingTransition.timingFunction = easingFunctions.easeInOutExpo;
              pendingTransition.done = false;
            });
          }
        }
      }

      function onClick(e: MouseEvent & { atlas: { x: number; y: number } }) {
        if (runtime.mode === 'explore') {
          runtime.world.zoomIn(e.atlas);
        }
      }

      function onWheel(e: WheelEvent & { atlas: { x: number; y: number } }) {
        const normalized = normalizeWheel(e);
        const zoomFactor = 1 + normalized.spinY / zoomWheelConstant;
        runtime.world.zoomTo(
          // Generating a zoom from the wheel delta
          zoomFactor,
          e.atlas,
          true
        );
      }

      // runtime.world.addEventListener('pointerup', pointerUp);
      // runtime.world.addEventListener('pointerdown', pointerDown);
      // runtime.world.addEventListener('pointermove', pointerMove);

      runtime.world.addEventListener('mouseup', onMouseUp);
      runtime.world.addEventListener('touchend', onMouseUp);
      runtime.world.addEventListener('touchstart', onTouchStart);
      runtime.world.addEventListener('mousedown', onMouseDown);

      runtime.world.addEventListener('touchend', onWindowMouseUp);
      window.addEventListener('mouseup', onWindowMouseUp);

      window.addEventListener('mousemove', onMouseMove);

      if (parentElement) {
        parentElement.addEventListener('touchmove', onTouchMove as any);
      }

      if (enableClickToZoom) {
        runtime.world.activatedEvents.push('onClick');
        runtime.world.addEventListener('click', onClick);
      }

      if (enableWheel) {
        runtime.world.activatedEvents.push('onWheel');
        runtime.world.addEventListener('wheel', onWheel);
      }

      // Layout subscriber - move more into here.
      const removeLayout = runtime.world.addLayoutSubscriber((type, data?: any) => {
        if (type === 'zone-changed') {
          runtime.transitionManager.constrainBounds({
            transition: { duration: 0 },
          });
        }
        if (type === 'zoom-to' && data) {
          // zoomTo(data.factor, data.point, data.stream);
          runtime.transitionManager.zoomTo(data.factor, {
            origin: data.point,
            stream: data.stream,
          });
        }
        if (type === 'go-home') {
          const transition = data.immediate ? { duration: 0 } : undefined;
          runtime.transitionManager.goToRegion(toBox(runtime.homePosition), { transition });
        }
        if (type === 'goto-region' && data) {
          const transition = data.immediate ? { duration: 0 } : {};
          runtime.transitionManager.goToRegion(data, { transition });
        }
        if (type === 'constrain-bounds') {
          runtime.transitionManager.constrainBounds({
            transition: data?.immediate ? { duration: 0 } : undefined,
          });
        }
      });

      return () => {
        runtime.world.removeEventListener('mouseup', onMouseUp);
        runtime.world.removeEventListener('touchend', onMouseUp);
        runtime.world.removeEventListener('touchstart', onTouchStart);
        runtime.world.removeEventListener('mousedown', onMouseDown);

        runtime.world.removeEventListener('touchend', onWindowMouseUp);
        window.removeEventListener('mouseup', onWindowMouseUp);

        runtime.world.removeEventListener('mousemove', onMouseMove);
        if (parentElement) {
          parentElement.removeEventListener('touchmove', onMouseMove);
        }
        if (enableClickToZoom) {
          runtime.world.removeEventListener('click', onClick);
        }

        if (enableWheel) {
          runtime.world.removeEventListener('wheel', onWheel);
        }

        removeLayout();
      };
    },
    updatePosition() {
      // no-op
    },
  };
};
