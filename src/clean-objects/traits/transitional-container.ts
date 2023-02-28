import {
  getDuration,
  hasPending,
  runObjectTransition,
  runObjectTransitions,
  TransitionableObject,
} from './transitional-object';
import { GenericObject } from './generic-object';
import { dispatchEvent, isEvented } from './evented';

export interface TransitionalContainer {
  activeTransitions: {
    paused: boolean;
    done: boolean;
    objects: Array<(TransitionableObject & GenericObject) | TransitionalContainer>;
  };
}

export interface TransitionalContainerProps {
  transitionsPaused?: boolean;
}

export function getClosestTransitionalContainer(
  object: GenericObject | (TransitionalContainer & GenericObject)
): (TransitionalContainer & GenericObject) | null {
  const parent = object.node.parent;
  if (!parent) {
    return null;
  }
  return isTransitionalContainer(parent) ? parent : getClosestTransitionalContainer(parent as any);
}

function isTransitionalContainer(t: unknown): t is TransitionalContainer & GenericObject {
  return !!(t as any).activeTransitions;
}

export function transitionalContainerDefaults(): TransitionalContainer {
  return {
    activeTransitions: {
      paused: false,
      objects: [],
      done: true,
    },
  };
}

export function notifyNewTransition(
  object: (TransitionableObject & GenericObject) | (TransitionalContainer & GenericObject),
  container?: TransitionalContainer & GenericObject
) {
  const closest = container || getClosestTransitionalContainer(object);
  if (!closest) {
    return; // For simpler cases where the user might run transitions manually.
  }

  // Will add to the delegated transitions queue.
  // Example tree structure:
  //
  // Transition container
  //   - Container
  //      - Transitional Object
  //      - Transitional Object
  //   - Container
  //   - Transitional container
  //      - Transitional Object
  //   - Container
  //
  //
  // These containers can be nested, and will handle their own transitions. They can be paused independently.
  // The "World" will be the root and be the entry point for running transitions.
  const isContainer = isTransitionalContainer(object);
  const isPending = isContainer ? !object.activeTransitions.done : hasPending(object);

  if (isPending) {
    closest.activeTransitions.done = false;
    if (closest.activeTransitions.objects.indexOf(object) === -1) {
      closest.activeTransitions.objects.push(object);
    }
  } else {
    const idx = closest.activeTransitions.objects.indexOf(object);
    if (idx !== -1) {
      closest.activeTransitions.objects.splice(idx, 1);
    }
    if (closest.activeTransitions.objects.length === 0) {
      closest.activeTransitions.done = true;
    }
  }

  // Propagate up the chain.
  const upperParent = getClosestTransitionalContainer(closest);
  if (upperParent) {
    notifyNewTransition(closest, upperParent);
  }
}

export function runContainerTransitions(container: TransitionalContainer & GenericObject, delta: number): boolean {
  if (container.activeTransitions.done) {
    return true;
  }

  if (container.activeTransitions.paused) {
    return false;
  }

  let isComplete = true;

  for (const object of container.activeTransitions.objects) {
    if (isTransitionalContainer(object)) {
      isComplete = runContainerTransitions(container, delta) && isComplete;
    } else {
      isComplete = runObjectTransitions(object as any, delta, container) && isComplete;
    }
  }

  return isComplete;
}

export function getContainerDuration(container: TransitionalContainer) {
  if (container.activeTransitions.done || container.activeTransitions.objects.length === 0) {
    return 0;
  }

  const durations: number[] = container.activeTransitions.objects.map((o) => {
    if (isTransitionalContainer(o)) {
      return getContainerDuration(o);
    } else {
      return getDuration(o as TransitionableObject);
    }
  });

  return Math.max(0, ...durations);
}

export function applyTransitionalContainerProps(
  object: TransitionalContainer & GenericObject,
  props: TransitionalContainerProps
) {
  let didChange = false;
  const isPaused = props.transitionsPaused || false;
  if (isPaused !== object.activeTransitions.paused) {
    didChange = true;
    object.activeTransitions.paused = isPaused;
  }
  return didChange;
}
