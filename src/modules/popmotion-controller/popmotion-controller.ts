/** @ts-ignore */
import normalizeWheel from 'normalize-wheel';
import { distance } from '../../utils';
import { compose, dna, scale, scaleAtOrigin, transform, translate, DnaFactory } from '@atlas-viewer/dna';
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
  ignoreSingleFingerTouch?: boolean;
  enablePanOnWait?: boolean;
  requireMetaKeyForWheelZoom?: boolean;
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
  ignoreSingleFingerTouch: false,
  enablePanOnWait: false,
  requireMetaKeyForWheelZoom: false,
  panOnWaitDelay: 40,
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
        parentElement,
        requireMetaKeyForWheelZoom,
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
        'onContextMenu'
      );

      /**
       * Resets the event state after the gesture of behavior has finished
       */
      function resetState() {
        currentDistance = 0;
        intent = '';
        setDataAttribute();
        setDataAttribute(undefined, 'notice');
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

      /**
       * Sets a data attribute to expose the current intent/behavior/note to the user
       *
       * @param value {string} - the data-attribute value
       * @param dataAttribute {string} - the data-attribute name
       */
      function setDataAttribute(value?: string, dataAttribute = 'intent') {
        if (parentElement) {
          parentElement.dataset[dataAttribute] = value;
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
        }
        setDataAttribute(intent);

        if (state.isPressing && e.touches.length === 1) {
          if (enablePanOnWait) {
            // if there is a delay between the touch-start and the 1st touch-move of < xms, then treat that as a PAN,
            // anything faster is a window scroll
            if (performance.now() - touchStartTime < panOnWaitDelay && intent == '') {
              intent = INTENT_SCROLL;
            }
            if (intent == '') {
              intent = INTENT_PAN;
            }
          }
          setDataAttribute(intent);
          // if we are ignoring a single finger touch, or it's a window-scroll, just 'return'
          if ((intent == '' && ignoreSingleFingerTouch == true) || intent == INTENT_SCROLL) {
            // have CanvasPanel do nothing... scroll the page
            setDataAttribute('require-two-finger', 'notice');
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

      function onWheelGuard(e: WheelEvent) {
        if (requireMetaKeyForWheelZoom && e.metaKey == false) {
          setDataAttribute('meta-required', 'notice');
          e.stopPropagation();
          return false;
        }
        return true;
      }

      runtime.world.addEventListener('mouseup', onMouseUp);
      runtime.world.addEventListener('touchend', onMouseUp);
      runtime.world.addEventListener('touchstart', onTouchStart);
      runtime.world.addEventListener('mousedown', onMouseDown);

      window.addEventListener('touchend', onWindowMouseUp);
      window.addEventListener('mouseup', onWindowMouseUp);

      window.addEventListener('mousemove', onMouseMove);

      if (parentElement) {
        // if this is bound to the window, then the entire interaction model goes haywire
        // unclear 100% why
        parentElement.addEventListener('touchmove', onTouchMove as any);
      }

      if (enableClickToZoom) {
        runtime.world.activatedEvents.push('onClick');
        runtime.world.addEventListener('click', onClick);
      }

      if (enableWheel) {
        runtime.world.activatedEvents.push('onWheel');
        if (requireMetaKeyForWheelZoom) {
          // add an event listener above the world to guard the wheel event if the 'meta' key is pressed
          parentElement?.addEventListener('wheel', onWheelGuard as any, { passive: true, capture: true });
        }
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
          // Use getHomeTarget to calculate the padded home position
          const paddingPx = data?.paddingPx;
          const homeTarget = runtime.getHomeTarget({ paddingPx });
          runtime.transitionManager.goToRegion(homeTarget, { transition });
        }
        if (type === 'goto-region' && data) {
          const transition = data.immediate ? { duration: 0 } : {};
          // If paddingPx is provided, use getHomeTarget to calculate the padded region
          if (data.paddingPx !== undefined) {
            const targetRegion = runtime.getHomeTarget({
              position: DnaFactory.singleBox(data.width, data.height, data.x, data.y),
              paddingPx: data.paddingPx,
            });
            runtime.transitionManager.goToRegion(targetRegion, { transition });
          } else {
            runtime.transitionManager.goToRegion(data, { transition });
          }
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

        window.removeEventListener('touchend', onWindowMouseUp);
        window.removeEventListener('mouseup', onWindowMouseUp);

        runtime.world.removeEventListener('mousemove', onMouseMove);
        if (parentElement) {
          (parentElement as any).removeEventListener('touchmove', onMouseMove);
          (parentElement as any).removeEventListener('wheel', onWheelGuard, { passive: true, capture: true });
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
