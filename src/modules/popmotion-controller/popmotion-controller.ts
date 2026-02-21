import { compose, DnaFactory, dna, scaleAtOrigin, transform, translate } from '@atlas-viewer/dna';
/** @ts-ignore */
import normalizeWheel from 'normalize-wheel';
import type { RuntimeController } from '../../types';
import { easingFunctions } from '../../utility/easing-functions';
import { distance } from '../../utils';

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
  /**
   * Enable inertial momentum when releasing from pan.
   */
  enablePanMomentum?: boolean;
  /**
   * Pan momentum intensity multiplier. 1 is the default "Apple-like" feel.
   */
  panMomentumStrength?: number;
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
  panTimeConstant: 325,
  panPower: 0.1,
  enablePanMomentum: true,
  panMomentumStrength: 1,
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
    start: (runtime) => {
      const {
        zoomWheelConstant,
        enableWheel,
        enableClickToZoom,
        ignoreSingleFingerTouch,
        enablePanOnWait,
        panOnWaitDelay,
        parentElement,
        requireMetaKeyForWheelZoom,
        enablePanMomentum,
        panMomentumStrength,
        panTimeConstant,
        panPadding,
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
        hasMovedSincePress: false,
      };
      const panSamples: Array<{ x: number; y: number; t: number }> = [];
      const momentum = {
        active: false,
        vx: 0,
        vy: 0,
      };
      const MIN_MOMENTUM_SPEED_PX_PER_MS = 0.08;
      const MOMENTUM_STOP_SPEED_PX_PER_MS = 0.02;
      const MOMENTUM_SAMPLE_WINDOW_MS = 80;
      const MOMENTUM_SAMPLE_MAX_AGE_MS = 140;

      function clearPanSamples() {
        panSamples.length = 0;
      }

      function recordPanSample(x: number, y: number) {
        const t = performance.now();
        const last = panSamples[panSamples.length - 1];
        if (last && last.x === x && last.y === y) {
          last.t = t;
          return;
        }
        panSamples.push({ x, y, t });
        while (panSamples.length > 1 && t - panSamples[0].t > MOMENTUM_SAMPLE_MAX_AGE_MS) {
          panSamples.shift();
        }
      }

      function stopPanMomentum() {
        momentum.active = false;
        momentum.vx = 0;
        momentum.vy = 0;
      }

      function applyPanTransition(toTarget: any) {
        runtime.transitionManager.customTransition((pendingTransition) => {
          pendingTransition.from = dna(runtime.target);
          pendingTransition.to = toTarget;
          pendingTransition.elapsed_time = 0;
          pendingTransition.total_time = 0;
          pendingTransition.timingFunction = easingFunctions.easeInOutExpo;
          pendingTransition.done = false;
        });
      }

      function calculateReleaseVelocity() {
        if (panSamples.length < 2) {
          return null;
        }
        const last = panSamples[panSamples.length - 1];
        let first = panSamples[0];
        for (let i = panSamples.length - 2; i >= 0; i--) {
          first = panSamples[i];
          if (last.t - first.t >= MOMENTUM_SAMPLE_WINDOW_MS) {
            break;
          }
        }
        const dt = last.t - first.t;
        if (dt <= 0) {
          return null;
        }
        return {
          vx: (last.x - first.x) / dt,
          vy: (last.y - first.y) / dt,
        };
      }

      function maybeStartPanMomentum() {
        if (!enablePanMomentum || !state.hasMovedSincePress || panSamples.length < 2) {
          return false;
        }
        const releaseVelocity = calculateReleaseVelocity();
        if (!releaseVelocity) {
          return false;
        }
        const strength = Math.max(0, panMomentumStrength);
        const vx = releaseVelocity.vx * strength;
        const vy = releaseVelocity.vy * strength;
        const speedPxPerMs = Math.hypot(vx, vy) * runtime.getScaleFactor();
        if (speedPxPerMs < MIN_MOMENTUM_SPEED_PX_PER_MS) {
          return false;
        }
        momentum.active = true;
        momentum.vx = vx;
        momentum.vy = vy;
        runtime.updateNextFrame();
        return true;
      }

      function releasePointer() {
        if (!state.isPressing) {
          resetState();
          return;
        }
        const startedMomentum = runtime.mode === 'explore' ? maybeStartPanMomentum() : false;
        if (runtime.mode === 'explore' && !startedMomentum) {
          runtime.world.constraintBounds();
        }
        state.isPressing = false;
        state.hasMovedSincePress = false;
        clearPanSamples();
        resetState();
      }

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
        releasePointer();
      }

      function onMouseDown(e: MouseEvent & { atlas: { x: number; y: number } }) {
        if (e.which > 1) {
          state.isPressing = false;
          return;
        }
        if (runtime.mode === 'explore') {
          e.preventDefault();
          stopPanMomentum();
          clearPanSamples();
          state.hasMovedSincePress = false;
          state.pointerStart.x = e.atlas.x;
          state.pointerStart.y = e.atlas.y;
          recordPanSample(runtime.target[1], runtime.target[2]);

          runtime.transitionManager.stopTransition();

          state.isPressing = true;
        }
      }

      function onWindowMouseUp() {
        releasePointer();
      }

      let currentDistance = 0;
      // the performance.now() time at 'touch-start'
      let touchStartTime = 0;
      // what the user's intent would be for the behavior
      let intent = '';
      function onTouchStart(
        e: TouchEvent & {
          atlasTouches: Array<{ id: number; x: number; y: number }>;
        }
      ) {
        if (runtime.mode === 'explore') {
          stopPanMomentum();
          clearPanSamples();
          state.hasMovedSincePress = false;
          if (e.atlasTouches.length === 1) {
            touchStartTime = performance.now();
            if (ignoreSingleFingerTouch == false) {
              // this prevents the touch propagation to the window, and thus doesn't drag the page
              e.preventDefault();
            }
            state.pointerStart.x = e.atlasTouches[0].x;
            state.pointerStart.y = e.atlasTouches[0].y;
            recordPanSample(runtime.target[1], runtime.target[2]);
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
            clearPanSamples();
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

      function onTouchMove(
        e: TouchEvent & {
          atlasTouches: Array<{ id: number; x: number; y: number }>;
        }
      ) {
        let clientX = null;
        let clientY = null;
        let newDistance = 0;
        let shouldRecordMomentum = false;
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
          shouldRecordMomentum = true;
        }

        // Translate.
        if (clientX !== null && clientY !== null) {
          const bounds = runtime.getRendererScreenPosition();
          if (bounds) {
            const { x, y } = runtime.viewerToWorld(clientX - bounds.x, clientY - bounds.y);

            const deltaDistance = newDistance && currentDistance ? newDistance / currentDistance : 1;
            const nextTarget = transform(
              dna(runtime.target),
              compose(
                translate(state.pointerStart.x - x, state.pointerStart.y - y),
                scaleAtOrigin(1 / deltaDistance, x, y)
              ),
              state.mousemoveBuffer
            );

            if (shouldRecordMomentum) {
              const previousSample = panSamples[panSamples.length - 1];
              if (previousSample && (previousSample.x !== nextTarget[1] || previousSample.y !== nextTarget[2])) {
                state.hasMovedSincePress = true;
              }
              recordPanSample(nextTarget[1], nextTarget[2]);
            }

            applyPanTransition(nextTarget);
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
            const nextTarget = transform(
              dna(runtime.target),
              translate(state.pointerStart.x - x, state.pointerStart.y - y),
              state.mousemoveBuffer
            );
            const previousSample = panSamples[panSamples.length - 1];
            if (previousSample && (previousSample.x !== nextTarget[1] || previousSample.y !== nextTarget[2])) {
              state.hasMovedSincePress = true;
            }
            recordPanSample(nextTarget[1], nextTarget[2]);
            applyPanTransition(nextTarget);
          }
        }
      }

      function onClick(e: MouseEvent & { atlas: { x: number; y: number } }) {
        if (runtime.mode === 'explore') {
          runtime.world.zoomIn(e.atlas);
        }
      }

      function onWheel(e: WheelEvent & { atlas: { x: number; y: number } }) {
        stopPanMomentum();
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
          parentElement?.addEventListener('wheel', onWheelGuard as any, {
            passive: true,
            capture: true,
          });
        }
        runtime.world.addEventListener('wheel', onWheel);
      }

      // Layout subscriber - move more into here.
      const removeLayout = runtime.world.addLayoutSubscriber((type, data?: any) => {
        if (type === 'zone-changed') {
          stopPanMomentum();
          runtime.transitionManager.constrainBounds({
            transition: { duration: 0 },
          });
        }
        if (type === 'zoom-to' && data) {
          stopPanMomentum();
          // zoomTo(data.factor, data.point, data.stream);
          runtime.transitionManager.zoomTo(data.factor, {
            origin: data.point,
            stream: data.stream,
          });
        }
        if (type === 'go-home') {
          stopPanMomentum();
          const transition = data.immediate ? { duration: 0 } : undefined;
          // Use getHomeTarget to calculate the padded home position
          const paddingPx = data?.paddingPx;
          const homeTarget = runtime.getHomeTarget({ paddingPx });
          runtime.transitionManager.goToRegion(homeTarget, { transition });
        }
        if (type === 'goto-region' && data) {
          stopPanMomentum();
          const transition = data.immediate ? { duration: 0 } : {};
          // If paddingPx is provided, use getHomeTarget to calculate the padded region
          if (data.paddingPx !== undefined) {
            const targetRegion = runtime.getHomeTarget({
              position: DnaFactory.singleBox(data.width, data.height, data.x, data.y),
              paddingPx: data.paddingPx,
            });
            runtime.transitionManager.goToRegion(targetRegion, {
              transition,
            });
          } else {
            runtime.transitionManager.goToRegion(data, { transition });
          }
        }
        if (type === 'constrain-bounds') {
          stopPanMomentum();
          runtime.transitionManager.constrainBounds({
            panPadding,
            transition: data?.immediate ? { duration: 0 } : undefined,
          });
        }
      });

      const removeMomentumHook = runtime.registerHook('useFrame', (delta: number) => {
        if (!momentum.active) {
          return;
        }
        const decay = Math.exp(-delta / Math.max(1, panTimeConstant));
        momentum.vx *= decay;
        momentum.vy *= decay;

        const speedPxPerMs = Math.hypot(momentum.vx, momentum.vy) * runtime.getScaleFactor();
        if (speedPxPerMs <= MOMENTUM_STOP_SPEED_PX_PER_MS) {
          stopPanMomentum();
          runtime.world.constraintBounds();
          return;
        }

        const proposed = transform(
          dna(runtime.target),
          translate(momentum.vx * delta, momentum.vy * delta),
          state.mousemoveBuffer
        );
        const [isConstrained, constrained] = runtime.constrainBounds(proposed, { panPadding });
        applyPanTransition(isConstrained ? constrained : proposed);

        if (isConstrained) {
          stopPanMomentum();
          runtime.world.constraintBounds(true);
          return;
        }

        runtime.updateNextFrame();
      });

      return () => {
        stopPanMomentum();
        runtime.world.removeEventListener('mouseup', onMouseUp);
        runtime.world.removeEventListener('touchend', onMouseUp);
        runtime.world.removeEventListener('touchstart', onTouchStart);
        runtime.world.removeEventListener('mousedown', onMouseDown);

        window.removeEventListener('touchend', onWindowMouseUp);
        window.removeEventListener('mouseup', onWindowMouseUp);

        window.removeEventListener('mousemove', onMouseMove);
        if (parentElement) {
          (parentElement as any).removeEventListener('touchmove', onTouchMove);
          (parentElement as any).removeEventListener('wheel', onWheelGuard, {
            passive: true,
            capture: true,
          });
        }
        if (enableClickToZoom) {
          runtime.world.removeEventListener('click', onClick);
        }

        if (enableWheel) {
          runtime.world.removeEventListener('wheel', onWheel);
        }

        removeMomentumHook();
        removeLayout();
      };
    },
    updatePosition() {
      // no-op
    },
  };
};
