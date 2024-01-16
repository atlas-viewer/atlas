import { dna, Strand } from '@atlas-viewer/dna';
import { EasingFunction, easingFunctions } from '../../utility/easing-functions';
import { constrainBounds } from '../helpers/constrain-bounds';

export type PendingTransition = {
  from: Strand;
  to: Strand;
  elapsedTime: number;
  totalTime: number;
  ease: EasingFunction;
  done: boolean;
  constrain: boolean;
};

export function getEmptyTransition(): PendingTransition {
  return {
    from: dna(5),
    to: dna(5),
    elapsedTime: 0,
    done: true,
    totalTime: 0,
    ease: /*@__INLINE__*/ easingFunctions.easeOutExpo,
    constrain: false,
  };
}

export function stopTransition(transition: PendingTransition, points: Strand) {
  transition.from = dna(points);
  transition.to = dna(points);
  transition.done = true;
  transition.elapsedTime = 0;
  transition.totalTime = 0;
}

export function applyTransition(
  transition: PendingTransition,
  points: Strand,
  target: Strand,
  transitionConfig?: { duration?: number; ease?: EasingFunction; constrain?: boolean },
  {
    stream,
  }: {
    stream?: boolean;
  } = {}
) {
  transition.from = dna(points);
  transition.to = target;
  if (!stream) {
    transition.elapsedTime = 0;
  }
  transition.done = false;
  if (!transitionConfig) {
    transition.totalTime = 1000;
    transition.constrain = false;
  } else {
    transition.totalTime = typeof transitionConfig?.duration !== 'undefined' ? transitionConfig.duration : 1000;
    transition.constrain = typeof transitionConfig?.constrain !== 'undefined' ? transitionConfig.constrain : false;
    transition.ease = transitionConfig?.ease || /*@__INLINE__*/ easingFunctions.easeOutExpo;
  }
}

export function runTransition(transition: PendingTransition, target: Strand, delta: number, onConstrain?: () => void) {
  if (!transition.done) {
    const td = transition.totalTime === 0 ? 0 : (transition.elapsedTime + delta) / transition.totalTime;
    const step = td === 0 ? 0 : transition.ease(td);

    // Update our target.
    target[1] = transition.from[1] + (transition.to[1] - transition.from[1]) * step;
    target[2] = transition.from[2] + (transition.to[2] - transition.from[2]) * step;
    target[3] = transition.from[3] + (transition.to[3] - transition.from[3]) * step;
    target[4] = transition.from[4] + (transition.to[4] - transition.from[4]) * step;

    // Update our transition.
    transition.elapsedTime += delta;
    if (transition.elapsedTime >= transition.totalTime) {
      transition.done = true;

      if (transition.constrain && onConstrain) {
        onConstrain();
      }

      return true;
    }
    return false;
  }
  return true;
}
