import { Runtime } from '../../renderer/runtime';
import { Position } from '../../types';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { easingFunctions, EasingFunction } from '../../utility/easing-functions';

export type PendingTransition = {
  from: Strand;
  to: Strand;
  elapsed_time: number;
  total_time: number;
  timingFunction: EasingFunction;
  done: boolean;
  constrain: boolean;
  callback?: () => void;
};

export class TransitionManager {
  runtime: Runtime;
  readonly pendingTransition: PendingTransition;

  constructor(runtime: Runtime) {
    this.runtime = runtime;
    this.pendingTransition = {
      from: dna(5),
      to: dna(5),
      elapsed_time: 0,
      done: true,
      total_time: 0,
      timingFunction: easingFunctions.easeInOutQuad,
      constrain: false,
    };
  }

  hasPending() {
    return !this.pendingTransition.done;
  }

  getPendingTransition() {
    return this.pendingTransition;
  }

  getPendingFrom() {
    return this.pendingTransition.from;
  }

  customTransition(func: (transition: PendingTransition) => void) {
    func(this.pendingTransition);
  }

  stopTransition() {
    this.pendingTransition.from = dna(this.runtime.target);
    this.pendingTransition.to = dna(this.runtime.target);
    this.pendingTransition.done = true;
    this.pendingTransition.elapsed_time = 0;
    this.pendingTransition.total_time = 0;
  }

  runTransition(target: Strand, delta: number) {
    if (!this.pendingTransition.done) {
      const transition = this.pendingTransition;
      const td = transition.total_time === 0 ? 0 : (transition.elapsed_time + delta) / transition.total_time;
      const step = transition.total_time === 0 ? 1 : td === 0 ? 0 : transition.timingFunction(td);

      // Update our target.
      target[1] = transition.from[1] + (transition.to[1] - transition.from[1]) * step;
      target[2] = transition.from[2] + (transition.to[2] - transition.from[2]) * step;
      target[3] = transition.from[3] + (transition.to[3] - transition.from[3]) * step;
      target[4] = transition.from[4] + (transition.to[4] - transition.from[4]) * step;

      // Update our transition.
      this.pendingTransition.elapsed_time += delta;
      if (this.pendingTransition.elapsed_time >= this.pendingTransition.total_time) {
        this.pendingTransition.done = true;
        this.pendingTransition.callback?.();

        if (this.pendingTransition.constrain) {
          // @todo make this configurable per transition?
          this.constrainBounds({
            transition: {
              duration: this.pendingTransition.total_time === 0 ? 0 : 500,
              easing: easingFunctions.easeOutExpo,
            },
          });
        }
      }
    }
  }

  lastZoomTo: {
    factor: number;
    options: any;
  } | null = null;

  resumeTransition() {
    console.log('resume', {
      lastZoom: this.lastZoomTo,
      isConstraining: this.isConstraining,
      lastGoToRegion: this.lastGoToRegion,
    })
    if (this.lastZoomTo) {
      this.zoomTo(this.lastZoomTo.factor, this.lastZoomTo.options);
    }
    if (this.isConstraining) {
      this.constrainBounds();
    }
    if (this.lastGoToRegion) {
      this.goToRegion(this.lastGoToRegion.target, this.lastGoToRegion.options);
    }
  }

  zoomTo(
    factor: number,
    options: {
      origin?: Position;
      stream?: boolean;
      minZoomFactor?: number;
      transition?: {
        duration?: number;
        easing?: EasingFunction;
      };
    } = {}
  ) {
    const {
      origin,
      stream = false,
      transition,
    } = options;

    this.lastZoomTo = { factor, options };

    const newPoints = this.runtime.getZoomedPosition(factor, { origin });

    const dist = Math.abs(1 - factor);

    this.applyTransition(
      newPoints,
      transition,
      {
        duration: 2000 * dist,
        easing: easingFunctions.easeOutExpo,
        constrain: true,
        callback: () => {
          this.lastZoomTo = null;
        }
      },
      { stream: false }
    );
  }

  isConstraining = false;

  constrainBounds({
    transition,
    panPadding = 0,
  }: {
    panPadding?: number;
    transition?: {
      duration?: number;
      easing?: EasingFunction;
    };
  } = {}) {
    this.isConstraining = true;
    const [isConstrained, constrained] = this.runtime.constrainBounds(this.runtime.target, { panPadding });

    if (isConstrained) {
      this.applyTransition(constrained, transition, {
        duration: 500,
        easing: easingFunctions.easeOutQuart,
        constrain: false,
        callback: () => {
          this.isConstraining = false;
        }
      });
      this.runtime.updateNextFrame();
    }
  }

  applyTransition(
    target: Strand,
    transition?: { duration?: number; easing?: EasingFunction; constrain?: boolean },
    defaults?: {
      duration: number;
      easing: EasingFunction;
      constrain?: boolean;
      callback?: () => void;
    },
    {
      stream,
    }: {
      stream?: boolean;
    } = {}
  ) {
    this.pendingTransition.from = dna(this.runtime.target);
    this.pendingTransition.to = target;
    if (!stream) {
      this.pendingTransition.elapsed_time = 0;
    }
    this.pendingTransition.done = false;
    this.pendingTransition.total_time =
      typeof transition?.duration !== 'undefined'
        ? transition.duration
        : typeof defaults?.duration !== 'undefined'
        ? defaults.duration
        : 1000;
    this.pendingTransition.constrain =
      typeof transition?.constrain !== 'undefined'
        ? transition.constrain
        : typeof defaults?.constrain !== 'undefined'
        ? defaults.constrain
        : false;
    this.pendingTransition.timingFunction = transition?.easing || defaults?.easing || easingFunctions.easeInOutSine;
  }

  lastGoToRegion: null | { target: any;  options: any } = null;

  goToRegion(
    target: {
      x: number;
      y: number;
      width: number;
      height: number;
      padding?: number;
    },
    {
      transition,
    }: {
      transition?: {
        duration?: number;
        easing?: EasingFunction;
      };
    } = {}
  ) {
    this.lastGoToRegion = { target, options: { transition } };
    const clampedRegion = this.runtime.clampRegion(target);
    this.applyTransition(
      DnaFactory.singleBox(clampedRegion.width, clampedRegion.height, clampedRegion.x, clampedRegion.y),
      transition,
      {
        duration: 1000,
        easing: easingFunctions.easeOutExpo,
        constrain: true,
        callback: () => {
          this.lastGoToRegion = null;
        }
      }
    );
    this.runtime.updateNextFrame();
  }
}
