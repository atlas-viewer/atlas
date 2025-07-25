import { Viewer, ViewingDirection } from './types';
import {
  compose,
  DnaFactory,
  dnaLength,
  hidePointsOutsideRegion,
  mutate,
  scale,
  scaleAtOrigin,
  translate,
  dna,
  Strand,
} from '@atlas-viewer/dna';
import { WorldObject } from './world-objects/world-object';
import { AbstractObject } from './world-objects/abstract-object';
import { Paint, Paintable } from './world-objects/paint';
import { ZoneInterface } from './world-objects/zone';
import { BaseObject } from './objects/base-object';
import { SpacialContent } from './spacial-content/spacial-content';
import { SupportedEvents } from './events';

type WorldTarget = { x: number; y: number; width?: number; height?: number };

type WorldProps = {
  width: number;
  height: number;
  viewingDirection: ViewingDirection;
};

export class World extends BaseObject<WorldProps, WorldObject> {
  id = 'world';
  _width: number;
  _height: number;
  aspectRatio: number;
  viewingDirection: ViewingDirection;
  aggregateBuffer = dna(9);
  isDirty = false;
  zones: ZoneInterface[] = [];
  filteredPointsBuffer: Strand;
  selectedZone?: number;
  triggerQueue: Array<[string, any]> = [];
  activatedEvents: string[] = [];
  _updatedList: any[] = [];
  translationBuffer = dna(9);
  needsRecalculate = true;
  emptyPaintables = [];
  renderOrder: number[] = [];

  get x(): number {
    return 0;
  }
  get y(): number {
    return 0;
  }
  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }

  points: Strand;

  // These should be the same size.
  private objects: Array<WorldObject | null> = [];
  subscriptions: Array<(type: string, changes?: unknown) => void> = [];

  constructor(width = 0, height = 0, worldObjectCount = 100, viewingDirection: ViewingDirection = 'left-to-right') {
    super();
    this._width = width;
    this._height = height;
    this.aspectRatio = Number.isNaN(width / height) ? 1 : width / height;
    this.viewingDirection = viewingDirection;
    this.points = dna(worldObjectCount * 5);
    this.filteredPointsBuffer = dna(worldObjectCount * 5);
  }

  static withProps(props: WorldProps) {
    const instance = new World();
    instance.applyProps(props);
    return instance;
  }

  applyProps(props: WorldProps) {
    if (
      typeof props.width !== 'undefined' &&
      typeof props.height !== 'undefined' &&
      (props.width !== this._width || props.height !== this._height)
    ) {
      this.resize(props.width, props.height);
    }
    if (props.viewingDirection !== this.viewingDirection) {
      this.viewingDirection = props.viewingDirection;
      this.triggerRepaint();
    }
  }

  propagateTouchEvent(eventName: string, e: TouchEvent, touchTargets: Array<{ x: number; y: number }>) {
    // if (this.activatedEvents.indexOf(eventName) === -1) return [];

    const targets = [];
    for (const touch of touchTargets) {
      if (touch.x && touch.y) {
        const point = DnaFactory.singleBox(1, 1, touch.x, touch.y);
        targets.push(this.getObjectsAt(point, true).reverse());
      }
    }

    return targets.map((target) => this.propagateEvent(eventName, e, target, { bubbles: true, cancelable: true }));
  }

  propagatePointerEvent<Name extends keyof SupportedEvents>(
    eventName: Name,
    e: any,
    x: number,
    y: number,
    opts: { bubbles?: boolean; cancelable?: boolean } = {}
  ) {
    // @todo re-add activated events, but smarter.
    // if (this.activatedEvents.indexOf(eventName) === -1) return [];
    const point = DnaFactory.singleBox(1, 1, x, y);
    const worldObjects = this.getObjectsAt(point, true).reverse();

    // Here there is more we can handle.
    // - When a move move event is detected:
    //    - Handle mouse enter / leave
    //    - Handle drag / drag start / drag end / drag-over
    // - When a mouse leave
    //    - Reset mouse over items
    // - When a mouse down event is detected:
    //    - Store click / clickStart / drag items

    return this.propagateEvent(eventName, e, worldObjects, opts);
  }

  _propagateEventTargets: any[] = [];
  propagateEvent(
    eventName: string,
    e: any,
    worldObjects: [WorldObject, SpacialContent[]][],
    { bubbles = false, cancelable = false }: { bubbles?: boolean; cancelable?: boolean } = {}
  ) {
    // @todo re-add activated events, but smarter.
    // if (this.activatedEvents.indexOf(eventName) === -1) return [];
    // Modify event if we need to.
    e.atlasTarget = this;

    // Store the stack of targets.
    this._propagateEventTargets.length = 1;
    this._propagateEventTargets[0] = this;

    // Set up a stop propagation
    let stopped = false;
    e.stopPropagation = () => {
      stopped = true;
    };

    const woLen = worldObjects.length;
    for (let w = woLen - 1; w >= 0; w--) {
      // @todo unsure why this was here.
      // if (w === 1) break;
      this._propagateEventTargets.unshift(worldObjects[w][0]);
      const len = worldObjects[w][1].length;
      if (len) {
        for (let i = 0; i < len; i++) {
          this._propagateEventTargets.unshift(worldObjects[w][1][i]);
        }
      }
    }

    const len = this._propagateEventTargets.length;
    let didFire = false;
    for (let i = 0; i < len; i++) {
      e.atlasTarget = this._propagateEventTargets[i];
      e.atlasWorld = this;
      didFire = this._propagateEventTargets[i].dispatchEvent(eventName as any, e) || didFire;
      if (stopped) break;
    }

    if (didFire) {
      this.triggerRepaint();
    }
    return this._propagateEventTargets;
  }

  appendChild(item: WorldObject) {
    const idx = this.appendWorldObject(item);
    this.renderOrder.push(idx / 5);
  }

  removeChild(item: WorldObject) {
    const index = this.objects.indexOf(item);

    if (index === -1) {
      for (const obj of this.objects) {
        if (obj && obj.id === item.id) {
          this.removeChild(obj);
          return;
        }
      }
      return;
    }

    this.objects[index] = null;
    this.renderOrder = this.renderOrder.filter((t) => t !== index);
    this.points[index * 5] = 0;
    this.triggerRepaint();
    this.needsRecalculate = true;
  }

  insertBefore(item: WorldObject, before: WorldObject) {
    const beforeIndex = this.objects.indexOf(before);
    if (beforeIndex === -1) {
      return;
    }

    const idx = this.appendWorldObject(item);
    this.renderOrder.splice(beforeIndex - 1, 0, idx / 5);
  }

  hideInstance() {
    // not yet implemented.
    // console.warn('hideInstance: Not yet implemented');
  }

  asWorldObject(): WorldObject | null {
    // @todo.
    return null;
  }

  addZone(zone: ZoneInterface) {
    this.zones.push(zone);
  }

  selectZone(id: string | number) {
    if (typeof id === 'string') {
      const len = this.zones.length;
      for (let i = 0; i < len; i++) {
        if (this.zones[i].id === id) {
          this.selectedZone = i;
          this.trigger('zone-changed');
          return;
        }
      }
    } else {
      if (this.zones[id]) {
        this.selectedZone = id;
        this.trigger('zone-changed');
      }
    }
  }

  deselectZone() {
    this.selectedZone = undefined;
  }

  getActiveZone(): ZoneInterface | undefined {
    if (this.selectedZone) {
      return this.zones[this.selectedZone];
    }
    return undefined;
  }

  hasActiveZone(): boolean {
    return typeof this.selectedZone !== 'undefined';
  }

  private checkResizeInternalBuffer() {
    if (dnaLength(this.points) === this.objects.length) {
      // resize, doubles each time, @todo change.
      const points = this.points;
      const newPoints = dna(this.points.length * 2);
      newPoints.set(points, 0);
      this.points = newPoints;
    }
  }

  appendWorldObject(object: WorldObject) {
    this.checkResizeInternalBuffer();

    const index = this.objects.length * 5;
    const pointValues = object.points;
    object.points = this.points.subarray(this.objects.length * 5, this.objects.length * 5 + 5);
    object.points[1] = pointValues[1];
    object.points[2] = pointValues[2];
    object.points[3] = pointValues[3];
    object.points[4] = pointValues[4];

    this.objects.push(object);
    this.filteredPointsBuffer = dna(this.objects.length * 5);
    this.needsRecalculate = true;

    this.triggerRepaint();

    return index;
  }

  recalculateWorldSize() {
    let didChange = false;
    if (this.needsRecalculate) {
      const wBuffer = new Int32Array(this.objects.length);
      const hBuffer = new Int32Array(this.objects.length);
      const len = this.renderOrder.length;
      for (let _index = 0; _index < len; _index++) {
        const index = this.renderOrder[_index];
        const object = this.objects[index];
        if (object) {
          wBuffer[_index] = this.points[index * 5 + 3];
          hBuffer[_index] = this.points[index * 5 + 4];
        }
      }
      const newWidth = Math.max(...wBuffer);
      if (newWidth !== this._width) {
        this._width = newWidth;
        didChange = true;
      }
      const newHeight = Math.max(...hBuffer);
      if (newHeight !== this._height) {
        this._height = newHeight;
        didChange = true;
      }
      if (didChange) {
        this.trigger('recalculate-world-size', { width: newWidth, height: newHeight });
      }
      this.needsRecalculate = false;
    }

    return didChange;
  }

  /**
   * @deprecated
   */
  addObjectAt(object: AbstractObject, target: WorldTarget): WorldObject {
    // @todo make target optional, default layout management
    //   to be applied that will simply line up all of the
    //   images in a row. The target is mainly to be used
    //   by a builder. Also support adding a world object
    //   here, which is itself an abstract object.

    if (target.width && !target.height) {
      target.height = (target.width / object.width) * object.height;
    } else if (target.height && !target.width) {
      target.width = (target.height / object.height) * object.width;
    }
    if (!target || !target.width || !target.height) {
      target.width = object.width;
      target.height = object.height;
    }

    const { width, x, y } = target;

    const scaleFactor = width / object.width;

    this.checkResizeInternalBuffer();

    // @todo integrity to ensure these remain.
    this.points.set(DnaFactory.singleBox(object.width, object.height, 0, 0), this.objects.length * 5);

    const worldObject = new WorldObject(object);

    worldObject.points = this.points.subarray(this.objects.length * 5, this.objects.length * 5 + 5);
    // worldObject.atScale(scaleFactor);
    // worldObject.translate(x, y);
    this.objects.push(worldObject);
    this.scaleWorldObject(this.objects.length - 1, scaleFactor);
    this.translateWorldObject(this.objects.length - 1, x, y);
    this.filteredPointsBuffer = dna(this.points.length * 2);

    this.triggerRepaint();
    this.needsRecalculate = true;

    return worldObject;
  }

  scaleWorldObject(index: number, factor: number) {
    mutate(
      this.points.subarray(index * 5, index * 5 + 5),
      scaleAtOrigin(factor, this.points[index * 5 + 1], this.points[index * 5 + 2])
    );
    const obj = this.objects[index];
    if (obj) {
      obj.atScale(factor);
      this.triggerRepaint();
    }
  }

  translateWorldObject(index: number, x: number, y: number) {
    mutate(this.points.subarray(index * 5, index * 5 + 5), translate(x, y));
    const obj = this.objects[index];
    if (obj) {
      obj.translate(x, y);
      this.triggerRepaint();
    }
  }

  resize(width: number, height: number) {
    this._width = width;
    this._height = height;

    this.aspectRatio = width / height;

    // @todo what happens when projections are out of bounds?
    // @todo what happens when objects are out of bounds?
    this.triggerRepaint();

    return this;
  }

  getObjects() {
    return this.objects;
  }

  getPoints() {
    return this.points;
  }

  getPointsFromViewer(target: Viewer, aggregate?: Strand) {
    const targetPoints = DnaFactory.singleBox(target.width, target.height, target.x, target.y);
    return this.getPointsAt(targetPoints, aggregate, target.scale);
  }

  addLayoutSubscriber(subscription: (type: string, data: unknown) => void) {
    this.subscriptions.push(subscription);

    return () => {
      this.subscriptions.splice(this.subscriptions.indexOf(subscription), 1);
    };
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>> {
    const filteredPoints = hidePointsOutsideRegion(this.points, target, this.filteredPointsBuffer);
    const len = this.objects.length;
    this._updatedList = [];
    for (let index = 0; index < len; index++) {
      if (filteredPoints[index * 5] !== 0) {
        if (!this.objects[index]) continue;
        this._updatedList.push(...(this.objects[index] as WorldObject).getScheduledUpdates(target, scaleFactor));
      }
    }
    return this._updatedList;
  }

  getObjectsAt(target: Strand, all = false): Array<[WorldObject, Paintable[]]> {
    const zone = this.getActiveZone();
    const filteredPoints = hidePointsOutsideRegion(this.points, target, this.filteredPointsBuffer);

    const len = this.renderOrder.length;
    const objects: Array<[WorldObject, Paintable[]]> = [];

    for (let _index = 0; _index < len; _index++) {
      const index = this.renderOrder[_index];
      if (filteredPoints[index * 5] !== 0) {
        const object = this.objects[index];
        if (!object || (zone && zone.objects.indexOf(object) === -1)) {
          continue;
        }
        if (object.type !== 'world-object') {
          objects.push([object, [object]] as any);
          continue;
        }
        if (all) {
          objects.push([object, object.getObjectsAt(target, all)]);
        } else {
          objects.push([object, this.emptyPaintables]);
        }
      }
    }

    return objects;
  }

  getPointsAt(target: Strand, aggregate?: Strand, scaleFactor = 1): Paint[] {
    const objects = this.getObjectsAt(target);
    const translation = compose(scale(scaleFactor), translate(-target[1], -target[2]), this.translationBuffer);
    const transformer = aggregate ? compose(aggregate, translation, this.aggregateBuffer) : translation;
    const len = objects.length;

    const layers: Paint[] = [];
    for (let index = 0; index < len; index++) {
      if (objects[index]) {
        layers.push(...objects[index][0].getAllPointsAt(target, transformer, scaleFactor));
      }
    }
    return layers;
  }

  _alreadyFlushed: any = [];
  flushSubscriptions() {
    if (this.triggerQueue.length) {
      this._alreadyFlushed = [];
      const queueLen = this.triggerQueue.length;
      for (let x = 0; x < queueLen; x++) {
        if (this._alreadyFlushed.indexOf(this.triggerQueue[x][0]) !== -1) {
          continue;
        }
        if (typeof this.triggerQueue[x][1] === 'undefined') {
          this._alreadyFlushed.push(this.triggerQueue[x][0]);
        }
        const len = this.subscriptions.length;
        for (let i = 0; i < len; i++) {
          // eslint-disable-next-line prefer-spread
          (this.subscriptions[i] as any).apply(null, this.triggerQueue[x]);
        }
      }
      this.triggerQueue = [];
    }
  }

  trigger<T>(type: string, data?: T) {
    this.triggerQueue.push([type, data]);
  }

  triggerEventActivation() {
    this.trigger('event-activation');
  }

  triggerRepaint() {
    this.trigger('repaint');
  }

  gotoRegion(data: {
    x: number;
    y: number;
    height: number;
    width: number;
    padding?: number;
    nudge?: boolean;
    immediate?: boolean;
  }) {
    this.trigger('goto-region', data);
  }

  goHome(immediate = false) {
    this.trigger('go-home', {
      immediate,
    });
  }

  zoomTo(factor: number, point?: { x: number; y: number }, stream?: boolean) {
    this.trigger('zoom-to', {
      point,
      factor,
      stream,
    });
  }

  zoomIn(point?: { x: number; y: number }) {
    this.trigger('zoom-to', {
      point,
      factor: 0.5,
    });
  }

  zoomOut(point?: { x: number; y: number }) {
    this.trigger('zoom-to', {
      point,
      factor: 2,
    });
  }

  constraintBounds(immediate?: boolean) {
    this.trigger('constrain-bounds', { immediate });
  }
}
