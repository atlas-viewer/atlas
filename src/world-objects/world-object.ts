import { Paint, Paintable } from './paint';
import { AbstractObject } from './abstract-object';
import {
  Strand,
  dna,
  compose,
  getIntersection,
  scale,
  transform,
  translate,
  hidePointsOutsideRegion,
} from '@atlas-viewer/dna';
import { BaseObject } from '../objects/base-object';

type WorldObjectProps = {
  id: string;
  width: number;
  height: number;
  scale?: number;
  x?: number;
  y?: number;
};

export class WorldObject extends BaseObject<WorldObjectProps, Paintable> {
  id: string;
  scale: number;
  layers: Paintable[];
  points: Strand;
  worldPoints: Strand;
  intersectionBuffer = dna(5);
  aggregateBuffer = dna(9);
  invertedBuffer = dna(9);
  filteredPointsBuffer: Strand;
  _updatedList: any[] = [];

  constructor(props?: AbstractObject, position?: { x: number; y: number }) {
    super();
    const { x = 0, y = 0 } = position || {};
    if (!props) {
      this.id = '';
      this.scale = 1;
      this.layers = [];
      this.points = dna(5);
      this.worldPoints = dna(5);
      this.filteredPointsBuffer = dna(5);
    } else {
      // @deprecated.
      this.id = props.id || '';
      this.scale = 1;
      this.layers = props.layers;
      this.points = dna([1, x, y, props.width, props.height]);
      this.worldPoints = dna([1, x, y, props.width, props.height]);
      this.filteredPointsBuffer = dna(props.layers.length * 5);
    }
  }

  static createWithProps(props: WorldObjectProps) {
    const instance = new WorldObject();
    instance.applyProps(props);
    return instance;
  }

  getProps() {
    return {
      id: this.id,
      width: this.points[3],
      height: this.points[4],
    };
  }

  applyProps(props: WorldObjectProps) {
    const x = props.x || 0;
    const y = props.y || 0;

    this.id = props.id;
    const s = typeof props.scale !== 'undefined' ? props.scale : this.scale;

    this.points[0] = 1;
    this.points[1] = x;
    this.points[2] = y;
    this.points[3] = x + props.width;
    this.points[4] = y + props.height;

    this.worldPoints[3] = this.worldPoints[1] + props.width * s;
    this.worldPoints[4] = this.worldPoints[2] + props.height * s;

    if (props.scale && props.scale !== 1) {
      this.atScale(s);
    }

    this.scale = s;

    // @todo this will be a bit tricky as we have to use the translate
    //   function to update the props. It will be a case of checking
    //   the props, and applying the difference. x = 2 => 3 = (x + 1)
    //   For the reconciler, we could also give access to the bare transforms
    //   Although that might be painful as the props would be out of sync.
  }

  appendChild(item: Paintable) {
    // Not set manually.
    if (item.points[0] === 0) {
      item.points.set(this.points);
    }

    this.addLayers([item]);
  }

  removeChild(item: Paintable) {
    this.layers = this.layers.filter(layer => layer !== item);
    this.filteredPointsBuffer = dna(this.layers.length * 5);
  }

  insertBefore(item: Paintable, before: Paintable) {
    const index = this.layers.indexOf(before);
    if (index === -1) {
      return;
    }

    const beforeLayers = this.layers.slice(0, index - 1);
    const afterLayers = this.layers.slice(index);
    this.layers = [...beforeLayers, item, ...afterLayers];
  }

  hideInstance() {
    console.warn('hideInstance: not yet implemented');
  }

  getObjectsAt(target: Strand): Paintable[] {
    const filteredPoints = hidePointsOutsideRegion(this.points, target, this.filteredPointsBuffer);
    if (filteredPoints[0] === 0) {
      return [];
    }

    const len = this.layers.length;
    const objects: Paintable[] = [];
    for (let index = 0; index < len; index++) {
      const layer = this.layers[index];

      const filter = hidePointsOutsideRegion(
        transform(layer.points, translate(this.x, this.y)),
        target,
        this.filteredPointsBuffer
      );

      if (filter[0] !== 0) {
        objects.push(layer);
      }
    }
    return objects;
  }

  getAllPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    const transformer = compose(translate(this.x, this.y), scale(this.scale), this.aggregateBuffer);

    const inter = getIntersection(target, this.points, this.intersectionBuffer);
    const len = this.layers.length;
    const arr: Paint[] = [];

    const t = transform(inter, compose(scale(1 / this.scale), translate(-this.x, -this.y), this.invertedBuffer));
    const agg = aggregate ? compose(aggregate, transformer, this.aggregateBuffer) : transformer;
    const s = scaleFactor * this.scale;
    for (let i = 0; i < len; i++) {
      // Crop intersection.
      arr.push(...this.layers[i].getAllPointsAt(t, agg, s));
    }
    return arr;
  }

  addLayers(paintables: Paintable[]) {
    this.layers = this.layers.concat(paintables);

    this.filteredPointsBuffer = dna(this.layers.length * 5);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>> {
    const len = this.layers.length;
    this._updatedList = [];
    const s = scaleFactor * this.scale;
    for (let i = 0; i < len; i++) {
      const updates = this.layers[i].getScheduledUpdates(target, s);
      if (updates) {
        this._updatedList.push(...updates);
      }
    }
    return this._updatedList;
  }
}
