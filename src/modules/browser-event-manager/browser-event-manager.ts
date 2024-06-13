import { Runtime } from '../../renderer/runtime';
import { distance } from '../../utils';
import { BaseObject } from '../../objects/base-object';
import { supportedEventMap } from '../../events';

export type BrowserEventManagerOptions = {
  /** Default 50ms **/
  simulationRate: number;
};

export class BrowserEventManager {
  element: HTMLElement;
  runtime: Runtime;
  unsubscribe: () => any;
  activatedEvents: string[] = [];
  eventHandlers: [string, any][] = [];
  bounds: DOMRect;
  listening: boolean;
  static eventPool = {
    atlas: { x: 0, y: 0 },
  };

  // Elements being moused over.
  // lastTouches: { x: number; y: number }[] = [];

  // Some state.
  pointerMoveEvent: PointerEvent | undefined = undefined;
  pointerEventState: {
    isClicking: boolean;
    isPressed: boolean;
    isDragging: boolean;
    mousedOver: BaseObject[];
    itemsBeingDragged: BaseObject[];
    mouseDownStart: { x: number; y: number };
    lastTouches: Array<{ id: number; x: number; y: number }>;
  } = {
    isClicking: false,
    isDragging: false,
    isPressed: false,
    mousedOver: [],
    itemsBeingDragged: [],
    mouseDownStart: { x: 0, y: 0 },
    lastTouches: [],
  };

  options: BrowserEventManagerOptions;

  constructor(element: HTMLElement, runtime: Runtime, options?: Partial<BrowserEventManagerOptions>) {
    this.element = element;
    this.runtime = runtime;
    this.unsubscribe = runtime.world.addLayoutSubscriber(this.layoutSubscriber.bind(this));
    this.bounds = element.getBoundingClientRect();
    this.listening = false;
    this.options = {
      simulationRate: 0,
      ...(options || {}),
    };

    let tAcc = 0;
    runtime.registerHook('useFrame', (t: number) => {
      tAcc += t;
      if (tAcc > this.options.simulationRate && this.pointerMoveEvent) {
        tAcc = 0;
        runtime.updateNextFrame();
      }
    });

    runtime.registerHook('useBeforeFrame', () => {
      if (this.pointerMoveEvent) {
        this.onPointerMove(this.pointerMoveEvent);
      }
    });

    // this is necessary for CavnasPanel to initialize the event listener
    this.activateEvents();
  }

  updateBounds() {
    this.bounds = this.element.getBoundingClientRect();
    this.runtime.updateRendererScreenPosition();
  }

  layoutSubscriber(type: string) {
    if (type === 'event-activation' && this.listening == false) {
      this.activateEvents();
    }
  }

  assignToEvent(e: any, x: number, y: number) {
    BrowserEventManager.eventPool.atlas.x = x;
    BrowserEventManager.eventPool.atlas.y = y;
    e.atlas = BrowserEventManager.eventPool.atlas;
  }

  activateEvents() {
    this.listening = true;
    this.element.addEventListener('pointermove', this._realPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointerdown', this.onPointerDown);

    // Normal events.
    this.element.addEventListener('mousedown', this.onPointerEvent);
    this.element.addEventListener('mouseup', this.onPointerEvent);
    this.element.addEventListener('pointercancel', this.onPointerEvent);

    // Edge-cases
    this.element.addEventListener('wheel', this.onWheelEvent);

    // Touch events.
    this.element.addEventListener('touchstart', this.onTouchEvent);
    this.element.addEventListener('touchcancel', this.onTouchEvent);
    this.element.addEventListener('touchend', this.onTouchEvent);
    this.element.addEventListener('touchmove', this.onTouchEvent);
  }

  _realPointerMove = (e: PointerEvent) => {
    this.pointerMoveEvent = e;
  };

  onWheelEvent = (e: WheelEvent) => {
    e.preventDefault();

    this.onPointerEvent(e);
  };

  onTouchEvent = (e: TouchEvent) => {
    const type = (supportedEventMap as any)[e.type as any];
    const atlasTouches = [];
    // const atlasTargetTouches = [];
    const len = e.touches.length;
    for (let i = 0; i < len; i++) {
      const touch = e.touches.item(i);
      if (!touch) continue;
      const { x, y } = this.runtime.viewerToWorld(touch.clientX - this.bounds.left, touch.clientY - this.bounds.top);

      const atlasTouch = { id: touch.identifier, x, y };

      atlasTouches.push(atlasTouch);
    }

    if (atlasTouches.length) {
      // Assign the first touch to the main atlas variable
      this.assignToEvent(e, atlasTouches[0].x, atlasTouches[0].y);
    }

    if (type !== 'onTouchEnd') {
      this.pointerEventState.lastTouches = atlasTouches;
      (e as any).atlasTouches = atlasTouches;
      this.runtime.world.propagateTouchEvent(type, e as any, atlasTouches);
    } else {
      (e as any).atlasTouches = [];
      this.runtime.world.propagateTouchEvent(type, e as any, this.pointerEventState.lastTouches);
      this.pointerEventState.lastTouches = [];
    }
  };

  onPointerEvent = (e: PointerEvent | MouseEvent) => {
    const ev = (supportedEventMap as any)[e.type as any];
    if (ev && this.runtime.world.activatedEvents.indexOf(ev) !== -1) {
      const { x, y } = this.runtime.viewerToWorld(e.clientX - this.bounds.left, e.clientY - this.bounds.top);
      this.assignToEvent(e, x, y);
      this.runtime.world.propagatePointerEvent(ev as any, e, x, y);
    }
  };

  onPointerDown = (e: PointerEvent | MouseEvent) => {
    this.pointerEventState.isPressed = true;
    this.pointerEventState.isClicking = true;
    this.pointerEventState.mouseDownStart.x = e.clientX;
    this.pointerEventState.mouseDownStart.y = e.clientY;
    setTimeout(() => {
      if (this.runtime) {
        this.pointerEventState.isClicking = false;
      }
    }, 250);
    setTimeout(() => {
      if (this.runtime && this.pointerEventState.isPressed && !this.pointerEventState.isDragging) {
        const dragStart = this.runtime.viewerToWorld(
          this.pointerEventState.mouseDownStart.x - this.bounds.left,
          this.pointerEventState.mouseDownStart.y - this.bounds.top
        );
        this.pointerEventState.isDragging = true;
        this.pointerEventState.itemsBeingDragged = this.runtime.world.propagatePointerEvent(
          'onDragStart',
          e,
          dragStart.x,
          dragStart.y
        );
      }
    }, 800);

    // And then handle as normal pointer event.
    this.onPointerEvent(e);
  };

  onPointerUp = (e: PointerEvent | MouseEvent) => {
    if (this.pointerEventState.isClicking) {
      const { x, y } = this.runtime.viewerToWorld(e.clientX - this.bounds.left, e.clientY - this.bounds.top);

      this.assignToEvent(e, x, y);

      this.runtime.world.propagatePointerEvent('onClick', e, x, y);
    }

    if (this.pointerEventState.isDragging) {
      for (const item of this.pointerEventState.itemsBeingDragged) {
        item.dispatchEvent('onDragEnd', e);
      }
      this.pointerEventState.isDragging = false;
    }
    this.pointerEventState.isClicking = false;
    this.pointerEventState.isPressed = false;
    this.pointerEventState.itemsBeingDragged = [];

    // Then handle as normal pointer event.
    this.onPointerEvent(e);
  };

  onPointerMove = (e: PointerEvent | MouseEvent) => {
    this.pointerMoveEvent = undefined;
    const { x, y } = this.runtime.viewerToWorld(e.clientX - this.bounds.left, e.clientY - this.bounds.top);

    if (Number.isNaN(x) || Number.isNaN(y)) {
      return;
    }

    this.assignToEvent(e, x, y);

    // We have to propagate both, but only get a new list from one.
    this.runtime.world.propagatePointerEvent('onPointerMove', e, x, y);
    const newList = this.runtime.world.propagatePointerEvent('onMouseMove', e, x, y);

    // This is where we handle mouse enter and mouse leave events. This could be
    // stored and handled inside of the world.
    const newIds = [];
    const newItems = [];
    for (const item of newList) {
      newIds.push(item.id);
      newItems.push(item);
      if (this.pointerEventState.mousedOver.indexOf(item) === -1) {
        item.dispatchEvent('onMouseEnter', e);
        item.dispatchEvent('onPointerEnter', e);

        // @todo the behaviour of these are slightly different.
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseover_event
        item.dispatchEvent('onMouseOver', e);
        item.dispatchEvent('onPointerOver', e);
      }
    }
    for (const oldItem of this.pointerEventState.mousedOver) {
      if (newIds.indexOf(oldItem.id) === -1) {
        oldItem.dispatchEvent('onMouseLeave', e);
        oldItem.dispatchEvent('onPointerLeave', e);

        // @todo the behaviour of these are slightly different.
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseout_event
        oldItem.dispatchEvent('onMouseOut', e);
        oldItem.dispatchEvent('onPointerOut', e);
      }
    }

    if (this.pointerEventState.isDragging) {
      for (const item of this.pointerEventState.itemsBeingDragged) {
        item.dispatchEvent('onDrag', e);
      }
      // @todo take the results of this and do a drag-over.
    }

    if (
      this.pointerEventState.isPressed &&
      !this.pointerEventState.isDragging &&
      distance(this.pointerEventState.mouseDownStart, { x: e.clientX, y: e.clientY }) > 50
    ) {
      const dragStart = this.runtime.viewerToWorld(
        this.pointerEventState.mouseDownStart.x - this.bounds.left,
        this.pointerEventState.mouseDownStart.y - this.bounds.top
      );
      this.pointerEventState.isDragging = true;
      this.pointerEventState.itemsBeingDragged = this.runtime.world.propagatePointerEvent(
        'onDragStart',
        { ...e, atlas: { x: dragStart.x, y: dragStart.y } },
        dragStart.x,
        dragStart.y
      );
    }
    this.pointerEventState.mousedOver = newItems;
  };

  normalizeEventName(event: string) {
    if (event.startsWith('on')) {
      return event.slice(2).toLowerCase();
    }
    return event.toLowerCase();
  }

  stop() {
    this.listening = false;
    this.element.removeEventListener('pointermove', this._realPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointerdown', this.onPointerDown);

    // Normal events.
    this.element.removeEventListener('mousedown', this.onPointerEvent);
    this.element.removeEventListener('mouseup', this.onPointerEvent);
    this.element.removeEventListener('pointercancel', this.onPointerEvent);

    // Edge-cases
    this.element.removeEventListener('wheel', this.onWheelEvent);

    // Touch events.
    this.element.removeEventListener('touchstart', this.onTouchEvent);
    this.element.removeEventListener('touchcancel', this.onTouchEvent);
    this.element.removeEventListener('touchend', this.onTouchEvent);
    this.element.removeEventListener('touchmove', this.onTouchEvent);

    // Unbind all events.
    this.unsubscribe();
    for (const [event, handler] of this.eventHandlers) {
      this.element.removeEventListener(this.normalizeEventName(event), handler);
    }
  }
}
