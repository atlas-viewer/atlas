import { ColdSubscription, easing, inertia, listen, pointer, tween, value } from 'popmotion';
/** @ts-ignore */
import normalizeWheel from 'normalize-wheel';
import { clamp } from '@popmotion/popcorn';
import { Projection } from '@atlas-viewer/dna';
import { RuntimeController, Position } from '../../types';

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
};

export const defaultConfig: Required<PopmotionControllerConfig> = {
  // Zoom options
  zoomOutFactor: 0.8,
  zoomInFactor: 1.25,
  maxZoomFactor: 1,
  minZoomFactor: 0.05,
  zoomDuration: 300,
  zoomWheelConstant: 100,
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
  enableClickToZoom: false,
};

export const popmotionController = (config: PopmotionControllerConfig = {}): RuntimeController => {
  const state: any = {
    viewer: undefined,
  };

  return {
    updatePosition(x, y, width, height) {
      if (state.viewer) {
        state.viewer.update({ x, y, width, height });
      }
    },
    start: function(runtime) {
      const {
        zoomDuration,
        zoomWheelConstant,
        zoomClamp,
        minZoomFactor,
        panBounceStiffness,
        panBounceDamping,
        panTimeConstant,
        panPower,
        nudgeDistance,
        panPadding,
        enableWheel,
        enableClickToZoom,
        devicePixelRatio,
      } = {
        ...defaultConfig,
        ...config,
      };

      // Some user interactions, using popmotion. This is an observer, listening
      //  to the x, y, height and width co-ordinates and updating the views.
      // This acts as a bridge to popmotion, allowing us to tween these values as
      // we see fit.
      const viewer = value(
        {
          x: runtime.target[1],
          y: runtime.target[2],
          width: runtime.target[3] - runtime.target[1],
          height: runtime.target[4] - runtime.target[2],
        } as Projection,
        // This takes in a {x, y, width, height} and updates the viewport.
        runtime.setViewport
      );

      state.viewer = viewer;

      // These two control the dragging, panning and zooming. The second has inertia
      // so it will slow down and bounce on the sides.
      runtime.world.activatedEvents.push('onMouseDown', 'onTouchStart');
      listen(runtime.world as any, 'mousedown touchstart').start((e: { touches: [] }) => {
        if (runtime.mode === 'explore') {
          const { x, y } = viewer.get() as Position;
          pointer({
            x: (-x * runtime.scaleFactor) / devicePixelRatio,
            y: (-y * runtime.scaleFactor) / devicePixelRatio,
          })
            .pipe((v: Position): Position => ({ x: v.x * devicePixelRatio, y: v.y * devicePixelRatio }))
            .pipe((v: Position): Position => ({ x: -v.x / runtime.scaleFactor, y: -v.y / runtime.scaleFactor }))
            .start(viewer);
        }
      });

      runtime.world.activatedEvents.push('onMouseUp', 'onTouchEnd');
      listen(runtime.world as any, 'mouseup touchend').start(() => {
        runtime.world.constraintBounds();
      });

      let isPressing = false;

      runtime.world.activatedEvents.push('onTouchStart');
      runtime.world.addEventListener('onTouchStart', e => {
        if (runtime.mode === 'explore') {
          isPressing = true;
        }
      });

      window.addEventListener('touchend', e => {
        if (isPressing) {
          runtime.world.constraintBounds();
          isPressing = false;
        }
      });

      runtime.world.activatedEvents.push('onMouseDown');
      runtime.world.addEventListener('onMouseDown', e => {
        isPressing = true;
      });

      window.addEventListener('mouseup', e => {
        if (isPressing) {
          if (runtime.mode === 'explore') {
            runtime.world.constraintBounds();
          }
          isPressing = false;
        }
      });

      document.addEventListener('keydown', e => {
        switch (e.code) {
          case 'ArrowLeft':
            runtime.world.gotoRegion({
              x: runtime.x - nudgeDistance / runtime.scaleFactor,
              y: runtime.y,
              width: runtime.width,
              height: runtime.height,
              nudge: true,
            });
            break;
          case 'ArrowRight':
            runtime.world.gotoRegion({
              x: runtime.x + nudgeDistance / runtime.scaleFactor,
              y: runtime.y,
              width: runtime.width,
              height: runtime.height,
              nudge: true,
            });
            break;
          case 'ArrowUp':
            runtime.world.gotoRegion({
              x: runtime.x,
              y: runtime.y - nudgeDistance / runtime.scaleFactor,
              width: runtime.width,
              height: runtime.height,
              nudge: true,
            });
            break;
          case 'ArrowDown':
            runtime.world.gotoRegion({
              x: runtime.x,
              y: runtime.y + nudgeDistance / runtime.scaleFactor,
              width: runtime.width,
              height: runtime.height,
              nudge: true,
            });
            break;
        }
      });

      // Click to zoom functionality.
      // @todo come back to this.
      // if (enableClickToZoom) {
      //   runtime.world.activatedEvents.push('onClick');
      //   runtime.world.addEventListener('onClick', ({ atlas }) => {
      //     if (runtime.mode === 'explore') {
      //       runtime.world.zoomIn(atlas);
      //     }
      //   });
      // }

      if (enableWheel) {
        runtime.world.activatedEvents.push('onWheel');
        runtime.world.addEventListener('onWheel', e => {
          const normalized = normalizeWheel(e);

          const zoomFactor = 1 + (normalized.pixelY * devicePixelRatio) / zoomWheelConstant;
          runtime.world.zoomTo(
            // Generating a zoom from the wheel delta
            clamp(1 - zoomClamp, 1 + zoomClamp, zoomFactor),
            e.atlas,
            true
          );
        });
      }

      // Pt 2. The subscribers.

      /**
       * Constrains bounds
       *
       * @param immediate
       */
      function constrainBounds(immediate = false) {
        const { x1, x2, y1, y2 } = runtime.getBounds(panPadding);

        if (immediate) {
          viewer.stop();
          viewer.update({
            x: x1,
            y: y1,
          });
          return;
        }

        inertia({
          min: { x: x1, y: y1 },
          max: { x: x2, y: y2 },
          bounceStiffness: panBounceStiffness,
          bounceDamping: panBounceDamping,
          timeConstant: immediate ? 0 : panTimeConstant,
          power: panPower,
          restDelta: 0,
          from: viewer.get(),
          velocity: viewer.getVelocity(),
        }).start(viewer);
      }

      // A generic zoom to function, with an optional origin parameter.
      // All of the points referenced are world points. You can pass your
      // own in or it will simply default to the middle of the viewport.
      // Note: the factor changes the size of the VIEWPORT on the canvas.
      // So smaller values will zoom in, and larger values will zoom out.
      let currentZoom: ColdSubscription | undefined;

      function zoomTo(factor: number, origin?: Position, stream = false) {
        // Save the before for the tween.
        const fromPos = runtime.getViewport();
        // set the new scale.
        const newPoints = runtime.getZoomedPosition(factor, { origin, minZoomFactor });
        // Need to update our observables, for pop-motion
        if (currentZoom) {
          currentZoom.stop();
        }
        currentZoom = tween({
          from: fromPos,
          to: Object.create({
            x: newPoints[1],
            y: newPoints[2],
            width: newPoints[3] - newPoints[1],
            height: newPoints[4] - newPoints[2],
          }),
          duration: zoomDuration,
          ease: stream ? easing.easeOut : easing.easeInOut,
        }).start(viewer);
      }

      // Layout subscriber - move more into here.
      runtime.world.addLayoutSubscriber((type, data: any) => {
        if (type === 'zone-changed') {
          // @TODO this needs to be "goHome" equivalent
          constrainBounds(true);
        }
        if (type === 'zoom-to') {
          zoomTo(data.factor, data.point, data.stream);
        }
        if (type === 'goto-region' && data) {
          const clampedRegion = runtime.clampRegion(data);
          const fromPos = runtime.getViewport();

          if (data.immediate) {
            viewer.stop();
            viewer.update(clampedRegion);
            return;
          }

          tween({
            from: fromPos,
            to: clampedRegion,
            duration: data.nudge ? zoomDuration : 1000,
            ease: easing.easeInOut,
          }).start(viewer);
        }
        if (type === 'constrain-bounds' && data) {
          constrainBounds(data.immediate);
        }
      });
    },
    stop() {
      // no-op.
      // @todo remove world events.
    },
  };
};
