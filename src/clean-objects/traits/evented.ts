import { AllEvents } from '../../modules/react-reconciler';
import { WorldObject } from '../../world-objects';
import { SpacialContent } from '../../spacial-content';
import { GenericObject, getTopParent } from './generic-object';
import { BaseObject } from '../base.object';
import { triggerLayout } from './layout';
import { DnaFactory } from '@atlas-viewer/dna';
import { getObjectsAt, PaintableObject } from './paintable';
import { SupportedEvents } from '../../events';

export type SupportedEventNames =
  | 'mousedown'
  | 'mouseenter'
  | 'mouseleave'
  | 'mousemove'
  | 'mouseout'
  | 'mouseover'
  | 'mouseup'
  | 'touchcancel'
  | 'touchend'
  | 'touchmove'
  | 'touchstart'
  | 'pointerdown'
  | 'pointermove'
  | 'pointerup'
  | 'pointercancel'
  | 'pointerenter'
  | 'pointerleave'
  | 'pointerover'
  | 'pointerout'
  | 'dragstart'
  | 'dragend'
  | 'dragenter'
  | 'dragexit'
  | 'drag'
  | 'dragover'
  | 'scroll'
  | 'wheel'
  | 'click';

export type SupportedEventFunctionNames =
  | 'onMouseDown'
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'onMouseMove'
  | 'onMouseOut'
  | 'onMouseOver'
  | 'onMouseUp'
  | 'onTouchCancel'
  | 'onTouchEnd'
  | 'onTouchMove'
  | 'onTouchStart'
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerOver'
  | 'onPointerOut'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onDragEnter'
  | 'onDragExit'
  | 'onDrag'
  | 'onDragOver'
  | 'onScroll'
  | 'onWheel'
  | 'onClick';

export type SupportedEventTypeMapping = {
  mousedown: 'onMouseDown';
  mouseenter: 'onMouseEnter';
  mouseleave: 'onMouseLeave';
  mousemove: 'onMouseMove';
  mouseout: 'onMouseOut';
  mouseover: 'onMouseOver';
  mouseup: 'onMouseUp';
  touchcancel: 'onTouchCancel';
  touchend: 'onTouchEnd';
  touchmove: 'onTouchMove';
  touchstart: 'onTouchStart';
  pointerdown: 'onPointerDown';
  pointermove: 'onPointerMove';
  pointerup: 'onPointerUp';
  pointercancel: 'onPointerCancel';
  pointerenter: 'onPointerEnter';
  pointerleave: 'onPointerLeave';
  pointerover: 'onPointerOver';
  pointerout: 'onPointerOut';
  dragstart: 'onDragStart';
  dragend: 'onDragEnd';
  dragenter: 'onDragEnter';
  dragexit: 'onDragExit';
  drag: 'onDrag';
  dragover: 'onDragOver';
  scroll: 'onScroll';
  wheel: 'onWheel';
  click: 'onClick';
};

export type SupportedEventFunctions = {
  // Mouse Events
  onMouseDown(e: MouseEvent & { atlas: { x: number; y: number } }): void;
  onMouseEnter(e: MouseEvent & { atlas: { x: number; y: number } }): void;
  onMouseLeave(e: MouseEvent & { atlas: { x: number; y: number } }): void;
  onMouseMove(e: MouseEvent & { atlas: { x: number; y: number } }): void;
  onMouseOut(e: MouseEvent & { atlas: { x: number; y: number } }): void;
  onMouseOver(e: MouseEvent & { atlas: { x: number; y: number } }): void;
  onMouseUp(e: MouseEvent & { atlas: { x: number; y: number } }): void;

  // Touch Events
  onTouchCancel(e: TouchEvent & { atlas: { x: number; y: number } }): void;
  onTouchEnd(e: TouchEvent & { atlas: { x: number; y: number } }): void;
  onTouchMove(e: TouchEvent & { atlas: { x: number; y: number } }): void;
  onTouchStart(e: TouchEvent & { atlas: { x: number; y: number } }): void;

  // Pointer Events
  onPointerDown(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerMove(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerUp(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerCancel(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerEnter(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerLeave(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerOver(e: PointerEvent & { atlas: { x: number; y: number } }): void;
  onPointerOut(e: PointerEvent & { atlas: { x: number; y: number } }): void;

  // Drag events
  onDragStart(e: DragEvent & { atlas: { x: number; y: number } }): void;
  onDragEnd(e: DragEvent & { atlas: { x: number; y: number } }): void;
  onDragEnter(e: DragEvent & { atlas: { x: number; y: number } }): void;
  onDragExit(e: DragEvent & { atlas: { x: number; y: number } }): void;
  onDrag(e: DragEvent & { atlas: { x: number; y: number } }): void;
  onDragOver(e: DragEvent & { atlas: { x: number; y: number } }): void;

  // UI Events
  onScroll(e: UIEvent & { atlas: { x: number; y: number } }): void;

  // Wheel Events
  onWheel(e: WheelEvent & { atlas: { x: number; y: number } }): void;

  // Other
  onClick(e: MouseEvent & { atlas: { x: number; y: number } }): void;
};

export type EventMap = {
  [Name in SupportedEventFunctionNames]: Array<{
    listener: SupportedEventFunctions[Name];
    options?: { capture?: boolean };
  }>;
};

export const supportedEventAttributes: Array<SupportedEventFunctionNames> = [
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseMove',
  'onMouseOut',
  'onMouseOver',
  'onMouseUp',
  'onTouchCancel',
  'onTouchEnd',
  'onTouchMove',
  'onTouchStart',
  'onPointerDown',
  'onPointerMove',
  'onPointerUp',
  'onPointerCancel',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerOver',
  'onPointerOut',
  'onDragStart',
  'onDragEnd',
  'onDragEnter',
  'onDragExit',
  'onDrag',
  'onDragOver',
  'onScroll',
  'onWheel',
  'onClick',
];

export interface Evented {
  events: {
    props: AllEvents;
    handlers: EventMap;
    targets: GenericObject[];
  };
}

export interface EventedHelpers {
  addEventListener<Name extends SupportedEventNames>(
    name: Name,
    cb: (e: any) => void,
    options?: { capture: boolean; passive: boolean }
  ): void;
  removeEventListener<Name extends SupportedEventNames>(name: Name, cb: (e: any) => void): void;
  dispatchEvent<Name extends SupportedEventFunctionNames>(name: Name, e: any): void;
}

export type EventListenerProps = Partial<SupportedEventFunctions>;

export const supportedEventMap = supportedEventAttributes.reduce((acc, ev) => {
  (acc as any)[ev.slice(2).toLowerCase()] = ev;
  (acc as any)[ev] = ev;
  return acc;
}, {} as { [ev in SupportedEventNames]: SupportedEventTypeMapping[ev] } & { [ev in SupportedEventFunctionNames]: ev });

export function createDefaultEventMap(): EventMap {
  return supportedEventAttributes.reduce((acc, next) => {
    (acc as any)[next] = [];
    return acc;
  }, {} as EventMap);
}

export function addEventListener<Name extends SupportedEventNames>(
  object: Evented,
  name: Name,
  cb: (e: any) => void,
  options?: { capture?: boolean; passive?: boolean }
) {
  const event: SupportedEventFunctionNames = supportedEventMap[name];
  if (!event || !object.events.handlers[event]) {
    throw new Error(`Unknown event ${name}`);
  }

  if (!object.events.handlers[event].find((all) => all.listener === cb)) {
    object.events.handlers[event].push({ listener: cb, options });
  }
}

export function removeEventListener<Name extends SupportedEventNames>(
  object: Evented,
  name: Name,
  cb: (e: any) => void
) {
  const event = supportedEventMap[name];
  if (!event || !object.events.handlers[event]) {
    throw new Error(`Unknown event ${name}`);
  }
  if (object.events.handlers[event].find((all) => all.listener === cb)) {
    object.events.handlers[event] = object.events.handlers[event]?.filter((e) => e.listener !== cb) as any[];
  }
}

export function isEvented(t: unknown): t is Evented {
  return !!(t && (t as any).events.handlers);
}

export function dispatchEvent<Name extends SupportedEventFunctionNames | SupportedEventNames>(
  obj: unknown,
  name: Name,
  e: any,
  toCapture = false
) {
  let didFire = false;
  if (isEvented(obj)) {
    const listeners = obj.events.handlers[supportedEventMap[name]];
    const len = listeners ? listeners.length : 0;
    if (len && listeners) {
      for (let x = 0; x < len; x++) {
        const capture = listeners[x]?.options?.capture;
        try {
          if (capture || !toCapture) {
            listeners[x].listener(e);
            didFire = true;
          }
        } catch (e) {
          console.error(name, e);
        }
      }
    }
  }
  return didFire;
}

export function eventsDefaults(): Evented {
  return {
    events: {
      handlers: createDefaultEventMap(),
      props: {},
      targets: [],
    },
  };
}

export function applyEventProps(instance: Evented, props: EventListenerProps): boolean {
  let didUpdate = false;
  const oldProps = instance.events.props;
  const newProps: any = {};

  for (const ev of supportedEventAttributes) {
    const event = supportedEventMap[ev];

    const toAdd = props[ev];
    const toRemove = oldProps[ev];

    if (toAdd !== toRemove) {
      if (toAdd) {
        addEventListener(instance, event as any, toAdd);
      }
      if (toRemove) {
        removeEventListener(instance, event as any, toRemove);
      }
      newProps[ev] = props[ev];
      didUpdate = true;
    }
  }

  if (didUpdate) {
    instance.events.props = newProps;
  }

  return didUpdate;
}

// @todo test
export function propagatePointerEvent<Name extends keyof SupportedEvents>(
  object: PaintableObject,
  eventName: Name,
  e: any,
  x: number,
  y: number,
  opts: { bubbles?: boolean; cancelable?: boolean } = {}
) {
  const point = DnaFactory.singleBox(1, 1, x, y);
  const objects = getObjectsAt(object, point).reverse();

  return propagateEvent(object, eventName, e, [objects], opts);
}

// @todo test
export function propagateTouchEvent(
  object: PaintableObject,
  eventName: string,
  e: TouchEvent,
  touchTargets: Array<{ x: number; y: number }>
) {
  const targets: PaintableObject[][] = [];
  for (const touch of touchTargets) {
    if (touch.x && touch.y) {
      const point = DnaFactory.singleBox(1, 1, touch.x, touch.y);
      targets.push(getObjectsAt(object, point).reverse());
    }
  }

  propagateEvent(object, eventName, e, targets);
}

// @todo test
export function propagateEvent(
  object: GenericObject & Evented,
  eventName: string,
  e: any,
  filteredObjects: PaintableObject[][],
  { bubbles = false, cancelable = false }: { bubbles?: boolean; cancelable?: boolean } = {}
) {
  e.atlasTarget = object;

  // Store the stack of targets.
  object.events.targets.length = 1;
  object.events.targets[0] = object;

  // Set up a stop propagation
  let stopped = false;
  e.stopPropagation = () => {
    stopped = true;
  };

  const woLen = filteredObjects.length;
  for (let w = woLen - 1; w >= 0; w--) {
    const len = filteredObjects[w].length;
    for (let i = 0; i < len; i++) {
      object.events.targets.unshift(filteredObjects[w][i]);
    }
  }

  const len = object.events.targets.length;
  let didFire = false;
  for (let i = 0; i < len; i++) {
    e.atlasTarget = object.events.targets[i];
    e.atlasWorld = getTopParent(object);
    const currentTarget = object.events.targets[i];
    if (isEvented(currentTarget)) {
      didFire = dispatchEvent(currentTarget, eventName as any, e) || didFire;
    }
    if (stopped) break;
  }

  if (didFire) {
    triggerLayout(object, { type: 'repaint' });
  }
  return object.events.targets;
}
