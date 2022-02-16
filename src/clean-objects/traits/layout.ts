// Layout subscribers.
import { getTopParent } from './generic-object';

export interface Layout {
  layout: {
    triggerQueue: LayoutEvent[];
    flushed: string[];
    subscriptions: Array<(type: string, changes?: unknown) => void>;
  };
}

export interface LayoutEvent {
  type: string;
  data?: any;
}

export interface RepaintLayoutEvent extends LayoutEvent {
  type: 'repaint';
  data?: never;
}

export interface EventActivationLayoutEvent extends LayoutEvent {
  type: 'event-activation';
  data?: never;
}

export interface GoToRegionLayoutEvent extends LayoutEvent {
  type: 'goto-region';
  data: {
    x: number;
    y: number;
    height: number;
    width: number;
    padding?: number;
    nudge?: boolean;
    immediate?: boolean;
  };
}

export interface GoHomeLayoutEvent extends LayoutEvent {
  type: 'go-home';
  data: {
    immediate?: boolean;
  };
}
export interface ConstrainBoundsLayoutEvent extends LayoutEvent {
  type: 'constrain-bounds';
  data: {
    immediate?: boolean;
  };
}

export interface ZoomToLayoutEvent extends LayoutEvent {
  type: 'zoom-to';
  data: {
    factor: number;
    point?: { x: number; y: number };
    stream?: boolean;
  };
}

type AllLayoutEvents =
  | RepaintLayoutEvent
  | EventActivationLayoutEvent
  | GoToRegionLayoutEvent
  | GoHomeLayoutEvent
  | ConstrainBoundsLayoutEvent
  | ZoomToLayoutEvent;

export function revisionDefaults(): Layout {
  return {
    layout: {
      triggerQueue: [],
      flushed: [],
      subscriptions: [],
    },
  };
}

export function hasLayouts(obj: unknown): obj is Layout {
  return !!(obj && (obj as any).layout);
}

export function addLayoutSubscription<T extends LayoutEvent = AllLayoutEvents>(
  input: unknown,
  subscription: (type: T['type'], data: T['data']) => void
) {
  const object = getTopParent(input as any);
  if (hasLayouts(object)) {
    object.layout.subscriptions.push(subscription);

    return () => {
      object.layout.subscriptions.splice(object.layout.subscriptions.indexOf(subscription), 1);
    };
  }

  return () => {
    // no-op
  };
}

export function triggerLayout(object: unknown, event: AllLayoutEvents) {
  const parent = getTopParent(object as any);
  if (hasLayouts(parent)) {
    parent.layout.triggerQueue.push(event);
  }
}

export function flushLayoutSubscriptions(input: Layout) {
  const object = getTopParent(input as any);
  if (!hasLayouts(object)) {
    return;
  }
  if (object.layout.triggerQueue.length) {
    object.layout.flushed = [];
    const queueLen = object.layout.triggerQueue.length;
    for (let x = 0; x < queueLen; x++) {
      if (!object.layout.triggerQueue[x] || object.layout.flushed.indexOf(object.layout.triggerQueue[x].type) !== -1) {
        continue;
      }
      if (typeof object.layout.triggerQueue[x].data === 'undefined') {
        object.layout.flushed.push(object.layout.triggerQueue[x].type);
      }
      const len = object.layout.subscriptions.length;
      for (let i = 0; i < len; i++) {
        // eslint-disable-next-line prefer-spread
        (object.layout.subscriptions[i] as any).apply(null, object.layout.triggerQueue[x]);
      }
    }
    object.layout.triggerQueue = [];
  }
}
