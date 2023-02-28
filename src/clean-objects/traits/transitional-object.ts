import { Strand } from '@atlas-viewer/dna';
import { EasingFunction, EasingFunctionNames, easingFunctions } from '../../utility/easing-functions';
import {
  applyTransition,
  getEmptyTransition,
  PendingTransition,
  runTransition,
  stopTransition,
} from '../runtime/transitions';
import { constrainBounds } from '../helpers/constrain-bounds';
import { GenericObject } from './generic-object';
import { areInputsEqual } from '../helpers/are-inputs-equal';
import { notifyNewTransition, TransitionalContainer } from './transitional-container';
import { dispatchEvent, isEvented } from './evented';

export interface TransitionableObject {
  //
  transitions: {
    target?: PendingTransition;
    display?: PendingTransition;
    crop?: PendingTransition;
    parsed: {
      target?: ParsedEasing;
      display?: ParsedEasing;
      crop?: ParsedEasing;
    };
    props?: any;
  };
}

type TransitionTypes = 'target' | 'display' | 'crop';
type LiteralUnion<T extends string | number> = T | Omit<T, T>;
type TransitionString = TransitionTypes | `${TransitionTypes} ${EasingFunctionNames}`;

type EasingProp =
  | { type: TransitionString; duration?: number; ease?: undefined }
  | { type: TransitionTypes; duration?: number; ease: EasingFunctionNames | EasingFunction };

type ParsedEasing = { duration: number; ease: EasingFunction; constrain?: boolean };

export interface TransitionableObjectProps {
  transition?: LiteralUnion<TransitionString> | EasingProp | Array<LiteralUnion<TransitionString> | EasingProp>;
}

export function transitionalObjectDefaults(): TransitionableObject {
  return {
    transitions: {
      parsed: {},
    },
  };
}

export function isTransitionable(object: unknown): object is TransitionableObject {
  return typeof (object as any).transitions !== 'undefined';
}

export function hasPending(object: TransitionableObject) {
  return (
    object.transitions &&
    (object.transitions.target?.done === false ||
      object.transitions.crop?.done === false ||
      object.transitions.display?.done === false)
  );
}

export function getPoints(object: TransitionableObject & GenericObject, type: TransitionTypes) {
  switch (type) {
    case 'display':
      return object.display.points;
    case 'crop':
      return object.node.crop;
    case 'target':
      return object.points;
  }
}

export function getConstraint(object: TransitionableObject & GenericObject, type: TransitionTypes) {
  switch (type) {
    case 'crop':
      return object.display.points;
    case 'target': {
      if (object.node.parent) {
        return object.node.parent.points;
      }
      return null;
    }
    case 'display':
    default:
      // Display can literally be anything - very unlikely to be transitioned like this.
      return null;
  }
}

export function stopObjectTransition(object: TransitionableObject & GenericObject, type: TransitionTypes) {
  const transition = object.transitions[type];
  if (transition) {
    const points = getPoints(object, type);
    stopTransition(transition, points);
  }
}

export function applyObjectTransition(
  object: TransitionableObject & GenericObject,
  type: TransitionTypes,
  target: Strand,
  transitionConfig?: ParsedEasing,
  options?: {
    stream?: boolean;
  }
) {
  const points = getPoints(object, type);
  if (!object.transitions[type]) {
    object.transitions[type] = getEmptyTransition();
  }

  const transition = object.transitions[type] as PendingTransition;
  return applyTransition(transition, points, target, transitionConfig, options);
}

export function runObjectTransition(
  object: TransitionableObject & GenericObject,
  type: TransitionTypes,
  delta: number
) {
  const transition = object.transitions[type];
  if (transition && !transition.done) {
    const points = getPoints(object, type);
    const maxBounds = getConstraint(object, type);
    return runTransition(
      transition,
      points,
      delta,
      maxBounds ? () => constrainBounds(maxBounds, points, true) : undefined
    );
  }
  return true;
}

export function getDuration(object: TransitionableObject) {
  return Math.max(
    object.transitions.display && !object.transitions.display.done
      ? object.transitions.display.totalTime - object.transitions.display.elapsedTime
      : 0,
    object.transitions.crop && !object.transitions.crop.done
      ? object.transitions.crop.totalTime - object.transitions.crop.elapsedTime
      : 0,
    object.transitions.target && !object.transitions.target.done
      ? object.transitions.target.totalTime - object.transitions.target.elapsedTime
      : 0
  );
}

export function runObjectTransitions(
  object: TransitionableObject & GenericObject,
  delta: number,
  container?: TransitionalContainer & GenericObject
) {
  let complete = true;
  complete = runObjectTransition(object, 'target', delta) && complete;
  complete = runObjectTransition(object, 'display', delta) && complete;
  complete = runObjectTransition(object, 'crop', delta) && complete;

  if (isEvented(object)) {
    dispatchEvent(object, 'onUpdate');
  }

  notifyNewTransition(object, container);

  return complete;
}

function isTransitionString(transition: unknown): transition is LiteralUnion<TransitionString> {
  return typeof transition === 'string';
}

export function applyTransitionalObjectProps(object: TransitionableObject, props: any) {
  let didUpdate = false;
  // If these are object, they should be memo-ed outside this.
  if (!areInputsEqual(object.transitions.props, props.transition)) {
    object.transitions.props = props.transition;
    const allTransitions = Array.isArray(props.transition) ? props.transition : [props.transition];
    const transitionState: TransitionableObject['transitions']['parsed'] = {};
    if (allTransitions.length) {
      didUpdate = true;

      for (const transition of allTransitions) {
        if (transition) {
          if (isTransitionString(transition)) {
            // 1. String.
            // [name] [200ms]? [easing]
            const [type, durationOrEasing, easingOrNil] = transition.split(' ').filter(Boolean);
            const easingName = (easingOrNil ? easingOrNil : durationOrEasing) as EasingFunctionNames;
            const durationStr = easingOrNil ? durationOrEasing : null;
            transitionState[type as TransitionTypes] = {
              ease: easingName
                ? easingFunctions[easingName] || easingFunctions.easeOutExpo
                : easingFunctions.easeOutExpo,
              duration: durationStr ? parseFloat(durationStr) * (durationStr.endsWith('ms') ? 1 : 1000) : 1000,
            };
          } else {
            // 2. Object
            const [type, easingString] = transition.type.split(' ');
            const easingName = transition.ease || (easingString as EasingFunctionNames);
            transitionState[type as TransitionTypes] = {
              duration: transition.duration || 1000,
              ease:
                easingName && typeof easingName === 'string'
                  ? (easingFunctions as any)[easingName] || easingFunctions.easeOutExpo
                  : easingFunctions.easeOutExpo,
            };
          }
        }
      }
      object.transitions.parsed = transitionState;
    }
  }
  return didUpdate;
}
