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
  transform,
} from '@atlas-viewer/dna';
import { WorldObject } from './world-objects/world-object';
import { AbstractObject } from './world-objects/abstract-object';
import { Paint, Paintable } from './world-objects/paint';
import { ZoneInterface } from './world-objects/zone';
import { BaseObject } from './objects/base-object';

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
  private objects: WorldObject[] = [];
  private subscriptions: Array<(type: string, changes?: unknown) => void> = [];

  constructor(width = 0, height = 0, worldObjectCount = 100, viewingDirection: ViewingDirection = 'left-to-right') {
    super();
    if (typeof width !== 'undefined') {
      console.warn('Passing in arguments to world is unsupported, use World.withProps()');
    }
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

  // Atlas object model.
  getProps() {
    return {
      width: this.width,
      height: this.height,
      viewingDirection: this.viewingDirection,
    };
  }

  applyProps(props: WorldProps) {
    if (props.width !== this.width || props.height !== this.height) {
      this.resize(props.width, props.height);
    }
    if (props.viewingDirection !== this.viewingDirection) {
      this.viewingDirection = props.viewingDirection;
      this.triggerRepaint();
    }
  }

  appendChild(item: WorldObject) {
    this.appendWorldObject(item);
  }

  removeChild(item: WorldObject) {
    const index = this.objects.indexOf(item);

    if (index === -1) {
      for (const obj of this.objects) {
        if (obj.id === item.id) {
          this.removeChild(obj);
          return;
        }
      }
      return;
    }

    if (index === 0) {
      this.points.set(this.points.slice((index + 1) * 5));
    } else {
      const before = this.points.slice(0, index * 5 - 1);
      const after = this.points.slice((index + 1) * 5);
      this.points.set(before);
      this.points.set(after, index * 5);
    }

    this.objects = this.objects.filter(obj => obj !== item);

    this.triggerRepaint();
  }

  insertBefore(item: WorldObject, before: WorldObject) {
    const beforeIndex = this.objects.indexOf(before);
    if (beforeIndex === -1) {
      return;
    }

    console.warn('insertBefore: Not yet implemented');
    this.appendWorldObject(item);
  }

  hideInstance() {
    // not yet implemented.
    console.warn('hideInstance: Not yet implemented');
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

    this.points.set(DnaFactory.singleBox(object.width, object.height, object.x, object.y), this.objects.length * 5);
    object.worldPoints = this.points.subarray(this.objects.length * 5, this.objects.length * 5 + 5);

    this.objects.push(object);
    this.filteredPointsBuffer = dna(this.objects.length * 5);
    this.recalculateWorldSize();

    this.triggerRepaint();
  }

  recalculateWorldSize() {
    const wBuffer = new Int32Array(this.objects.length);
    const hBuffer = new Int32Array(this.objects.length);
    const totalObjects = this.objects.length;
    for (let x = 0; x < totalObjects; x++) {
      wBuffer[x] = this.points[x * 5 + 3];
      hBuffer[x] = this.points[x * 5 + 4];
    }
    this._width = Math.max(...wBuffer);
    this._height = Math.max(...hBuffer);
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

    worldObject.worldPoints = this.points.subarray(this.objects.length * 5, this.objects.length * 5 + 5);
    // worldObject.atScale(scaleFactor);
    // worldObject.translate(x, y);
    this.objects.push(worldObject);
    this.scaleWorldObject(this.objects.length - 1, scaleFactor);
    this.translateWorldObject(this.objects.length - 1, x, y);
    this.filteredPointsBuffer = dna(this.points.length * 2);

    this.triggerRepaint();

    return worldObject;
  }

  scaleWorldObject(index: number, factor: number) {
    mutate(
      this.points.subarray(index * 5, index * 5 + 5),
      scaleAtOrigin(factor, this.points[index * 5 + 1], this.points[index * 5 + 2])
    );
    this.objects[index].atScale(factor);
    this.triggerRepaint();
  }

  translateWorldObject(index: number, x: number, y: number) {
    mutate(this.points.subarray(index * 5, index * 5 + 5), translate(x, y));
    this.objects[index].translate(x, y);
    this.triggerRepaint();
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
    const length = this.subscriptions.length;
    this.subscriptions.push(subscription);

    return () => {
      this.subscriptions.splice(length, 1);
    };
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>> {
    const filteredPoints = hidePointsOutsideRegion(this.points, target, this.filteredPointsBuffer);
    const len = this.objects.length;
    const list = [];
    for (let index = 0; index < len; index++) {
      if (filteredPoints[index * 5] !== 0) {
        list.push(...this.objects[index].getScheduledUpdates(target, scaleFactor));
      }
    }
    return list;
  }

  getObjectsAt(target: Strand, all = false): Array<[WorldObject, Paintable[]]> {
    const zone = this.getActiveZone();
    const filteredPoints = hidePointsOutsideRegion(this.points, target, this.filteredPointsBuffer);
    const transformer = translate(-target[1], -target[2]);

    const len = this.objects.length;
    const objects: Array<[WorldObject, Paintable[]]> = [];
    for (let index = 0; index < len; index++) {
      if (filteredPoints[index * 5] !== 0) {
        if (zone && zone.objects.indexOf(this.objects[index]) === -1) {
          continue;
        }

        const object = this.objects[index];

        if (all) {
          objects.push([object, object.getObjectsAt(transform(target, transformer))]);
        } else {
          objects.push([object, []]);
        }
      }
    }
    return objects;
  }

  getPointsAt(target: Strand, aggregate?: Strand, scaleFactor = 1): Paint[] {
    const objects = this.getObjectsAt(target);
    const translation = compose(scale(scaleFactor), translate(-target[1], -target[2]));
    const transformer = aggregate ? compose(aggregate, translation, this.aggregateBuffer) : translation;
    const len = objects.length;
    const layers: Paint[] = [];
    for (let index = 0; index < len; index++) {
      layers.push(...objects[index][0].getAllPointsAt(target, transformer, scaleFactor));
    }
    return layers;
  }

  flushSubscriptions() {
    if (this.triggerQueue.length) {
      const alreadyFlushed = [];
      for (const [type, data] of this.triggerQueue) {
        if (alreadyFlushed.indexOf(type) !== -1) {
          continue;
        }
        if (typeof data === 'undefined') {
          alreadyFlushed.push(type);
        }
        const len = this.subscriptions.length;
        for (let i = 0; i < len; i++) {
          this.subscriptions[i](type, data);
        }
      }
      this.triggerQueue = [];
    }
  }

  trigger<T>(type: string, data?: T) {
    this.triggerQueue.push([type, data]);
  }

  triggerRepaint() {
    this.trigger('repaint');
  }
}
