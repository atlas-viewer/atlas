import { supportedEventMap } from '../../events';
import type { BaseObject } from '../../objects/base-object';
import type { Runtime } from '../../renderer/runtime';
import { distance } from '../../utils';

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
  private touchPointers = new Map<number, PointerEvent>();
  private interactionTargets = new Set<BaseObject | Runtime['world']>();
  private sketchTouchBlocked = false;
  private pressSequence = 0;
  private originalTouchAction: string;
  private removeBeforeFrame: () => void;
  private removeFrame: () => void;
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
    this.originalTouchAction = element.style.touchAction;
    this.updateTouchAction();
    this.unsubscribe = runtime.world.addLayoutSubscriber(this.layoutSubscriber.bind(this));
    this.bounds = element.getBoundingClientRect();
    this.listening = false;
    this.options = {
      simulationRate: 0,
      ...(options || {}),
    };

    let tAcc = 0;
    this.removeFrame = runtime.registerHook('useFrame', (t: number) => {
      this.updateTouchAction();
      tAcc += t;
      if (tAcc > this.options.simulationRate && this.pointerMoveEvent) {
        tAcc = 0;
        runtime.updateNextFrame();
      }
    });

    this.removeBeforeFrame = runtime.registerHook('useBeforeFrame', () => {
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

  isHoldToHomeIntentActive() {
    return this.element.dataset.intent === 'hold-home';
  }

  activateEvents() {
    this.listening = true;
    this.element.addEventListener('pointermove', this._realPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointerdown', this.onPointerDown);

    // Normal events.
    this.element.addEventListener('mousedown', this.onPointerEvent);
    this.element.addEventListener('mouseup', this.onPointerEvent);
    this.element.addEventListener('pointercancel', this.onPointerCancel);

    // Edge-cases
    this.element.addEventListener('wheel', this.onWheelEvent);
    this.element.addEventListener('contextmenu', this.onContextMenu);

    // Touch events.
    this.element.addEventListener('touchstart', this.onTouchEvent, { passive: false });
    this.element.addEventListener('touchcancel', this.onTouchEvent);
    this.element.addEventListener('touchend', this.onTouchEvent);
    this.element.addEventListener('touchmove', this.onTouchEvent, { passive: false });
  }

  _realPointerMove = (e: PointerEvent) => {
    if (distance(this.pointerEventState.mouseDownStart, { x: e.clientX, y: e.clientY }) > 5) {
      this.pointerEventState.isClicking = false;
    }
    this.pointerMoveEvent = e;
  };

  onWheelEvent = (e: WheelEvent) => {
    e.preventDefault();

    this.onPointerEvent(e);
  };

  onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const ev = 'onContextMenu';
    if (this.runtime.world.activatedEvents.indexOf(ev) !== -1) {
      const { x, y } = this.runtime.viewerToWorld(e.clientX - this.bounds.left, e.clientY - this.bounds.top);
      this.assignToEvent(e, x, y);
      this.runtime.world.propagatePointerEvent(ev as any, e, x, y);
    }
  };

  onTouchEvent = (e: TouchEvent) => {
    this.lastTouchTime = performance.now();
    if (this.runtime.mode === 'sketch' && e.cancelable) e.preventDefault();
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

    (e as any).atlasTouches = atlasTouches;
    if (type === 'onTouchCancel') {
      this.cancelInteraction();
      this.runtime.world.dispatchEvent(type, e);
      this.pointerEventState.lastTouches = [];
      this.sketchTouchBlocked = len > 0 && this.runtime.mode === 'sketch';
      if (len === 0) this.touchPointers.clear();
      return;
    }
    if (this.runtime.mode === 'sketch' &&
      (this.runtime.sketchPanOverride || (len >= 2 && this.runtime.sketchTouchNavigation === 'two-finger'))) {
      this.blockSketchTouch();
    }
    if (this.sketchTouchBlocked) {
      // Controllers still see the raw touch lifecycle, tools only see cancellation.
      this.runtime.world.dispatchEvent(type, e);
      if (len === 0) {
        this.sketchTouchBlocked = false;
        this.touchPointers.clear();
        this.pointerMoveEvent = undefined;
        this.interactionTargets.clear();
        this.pointerEventState.lastTouches = [];
      }
      return;
    }

    if (type !== 'onTouchEnd' && type !== 'onTouchCancel') {
      this.pointerEventState.lastTouches = atlasTouches;
      (e as any).atlasTouches = atlasTouches;
      const targets = this.runtime.world.propagateTouchEvent(type, e as any, atlasTouches);
      if (type === 'onTouchStart') {
        for (const target of targets.flat()) this.interactionTargets.add(target);
      }
    } else {
      (e as any).atlasTouches = [];
      this.runtime.world.propagateTouchEvent(type, e as any, this.pointerEventState.lastTouches);
      this.pointerEventState.lastTouches = [];
      if (len === 0) this.interactionTargets.clear();
    }
  };

  onPointerEvent = (e: PointerEvent | MouseEvent) => {
    // Touch pointer events own tool input. Suppress compatibility mouse events,
    // which otherwise start a second tool interaction after the touch finishes.
    if (e.type.startsWith('mouse') && this.isCompatibilityMouseEvent(e)) return;
    if (e.button === 2) {
      return;
    }
    const ev = (supportedEventMap as any)[e.type as any];
    if (ev && this.runtime.world.activatedEvents.indexOf(ev) !== -1) {
      const { x, y } = this.runtime.viewerToWorld(e.clientX - this.bounds.left, e.clientY - this.bounds.top);
      this.assignToEvent(e, x, y);
      if (this.runtime.mode === 'sketch' && this.runtime.sketchPanOverride) {
        this.runtime.world.dispatchEvent(ev, e);
        return [];
      }
      return this.runtime.world.propagatePointerEvent(ev as any, e, x, y);
    }
  };

  private lastTouchTime = -Infinity;

  private isCompatibilityMouseEvent(e: MouseEvent) {
    return (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities
      ?.firesTouchEvents || performance.now() - this.lastTouchTime < 800;
  }

  private updateTouchAction() {
    this.element.style.touchAction = this.runtime.mode === 'sketch' ? 'none' : this.originalTouchAction;
  }

  private blockSketchTouch() {
    if (this.sketchTouchBlocked) return;
    this.sketchTouchBlocked = true;
    this.cancelInteraction();
  }

  private cancelInteraction(source?: PointerEvent) {
    this.pressSequence++;
    const first = source || this.touchPointers.values().next().value;
    const cancel = new PointerEvent('pointercancel', {
      pointerId: first?.pointerId ?? 0, pointerType: first?.pointerType ?? 'touch',
      clientX: first?.clientX ?? this.pointerEventState.mouseDownStart.x,
      clientY: first?.clientY ?? this.pointerEventState.mouseDownStart.y,
    });
    const { x, y } = this.runtime.viewerToWorld(cancel.clientX - this.bounds.left, cancel.clientY - this.bounds.top);
    this.assignToEvent(cancel, x, y);
    const touchCancel = new Event('touchcancel');
    Object.assign(touchCancel, { atlas: { x, y }, atlasTouches: [], touches: [], changedTouches: [] });
    // Use the original press recipients, even if the finger has left their bounds.
    for (const target of this.interactionTargets) {
      Object.assign(cancel, { atlasTarget: target, atlasWorld: this.runtime.world });
      Object.assign(touchCancel, { atlasTarget: target, atlasWorld: this.runtime.world });
      target.dispatchEvent('onPointerCancel', cancel);
      if (target !== this.runtime.world) target.dispatchEvent('onTouchCancel', touchCancel);
    }
    this.interactionTargets.clear();
    this.pointerMoveEvent = undefined;
    this.pointerEventState.isClicking = false;
    this.pointerEventState.isPressed = false;
    this.pointerEventState.isDragging = false;
    this.pointerEventState.itemsBeingDragged = [];
  }

  onPointerCancel = (e: PointerEvent) => {
    this.touchPointers.delete(e.pointerId);
    this.cancelInteraction(e);
  };

  onPointerDown = (e: PointerEvent | MouseEvent) => {
    this.updateTouchAction();
    if ('pointerType' in e && e.pointerType === 'touch') {
      this.lastTouchTime = performance.now();
      this.touchPointers.set(e.pointerId, e);
      if (this.runtime.mode === 'sketch' && (this.runtime.sketchPanOverride ||
        (this.touchPointers.size >= 2 && this.runtime.sketchTouchNavigation === 'two-finger'))) this.blockSketchTouch();
      if (this.sketchTouchBlocked) return;
    }
    if (e.button === 2) {
      return;
    }
    if (!this.pointerEventState.isPressed) this.interactionTargets.clear();
    if (this.runtime.mode === 'sketch' && this.runtime.sketchPanOverride) {
      this.onPointerEvent(e);
      return;
    }
    const sequence = ++this.pressSequence;
    this.pointerEventState.isPressed = true;
    this.pointerEventState.isClicking = true;
    this.pointerEventState.mouseDownStart.x = e.clientX;
    this.pointerEventState.mouseDownStart.y = e.clientY;
    setTimeout(() => {
      if (this.runtime && sequence === this.pressSequence) {
        this.pointerEventState.isClicking = false;
      }
    }, 250);
    setTimeout(() => {
      if (this.runtime && sequence === this.pressSequence && this.pointerEventState.isPressed && !this.pointerEventState.isDragging) {
        if (this.isHoldToHomeIntentActive()) {
          return;
        }
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
    const targets = this.onPointerEvent(e);
    for (const target of targets || []) this.interactionTargets.add(target);
  };

  onPointerUp = (e: PointerEvent | MouseEvent) => {
    this.pressSequence++;
    if ('pointerType' in e && e.pointerType === 'touch') {
      this.lastTouchTime = performance.now();
      this.touchPointers.delete(e.pointerId);
      if (this.sketchTouchBlocked) return;
    }
    if (e.button === 2) {
      return;
    }
    if (!(this.runtime.mode === 'sketch' && this.runtime.sketchPanOverride) &&
      this.pointerEventState.isClicking && distance(this.pointerEventState.mouseDownStart, { x: e.clientX, y: e.clientY }) <= 5) {
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
    if (!('pointerType' in e) || e.pointerType !== 'touch') this.interactionTargets.clear();
  };

  onPointerMove = (e: PointerEvent | MouseEvent) => {
    this.pointerMoveEvent = undefined;
    if (this.runtime.mode === 'sketch' && this.runtime.sketchPanOverride) {
      if (this.interactionTargets.size) this.cancelInteraction();
      return;
    }
    if ('pointerType' in e && e.pointerType === 'touch' && this.sketchTouchBlocked) return;
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
      !this.isHoldToHomeIntentActive() &&
      distance(this.pointerEventState.mouseDownStart, {
        x: e.clientX,
        y: e.clientY,
      }) > 50
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
    this.pressSequence++;
    this.touchPointers.clear();
    this.interactionTargets.clear();
    this.pointerMoveEvent = undefined;
    this.removeFrame();
    this.removeBeforeFrame();
    this.element.style.touchAction = this.originalTouchAction;
    this.listening = false;
    this.element.removeEventListener('pointermove', this._realPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointerdown', this.onPointerDown);

    // Normal events.
    this.element.removeEventListener('mousedown', this.onPointerEvent);
    this.element.removeEventListener('mouseup', this.onPointerEvent);
    this.element.removeEventListener('pointercancel', this.onPointerCancel);

    // Edge-cases
    this.element.removeEventListener('wheel', this.onWheelEvent);
    this.element.removeEventListener('contextmenu', this.onContextMenu);

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
