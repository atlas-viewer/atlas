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
import { SpacialContent } from '../spacial-content';
import { Geometry } from '../objects/geometry';

function rotate(cx: number, cy: number, x: number, y: number, angle: number) {
  const radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = cos * (x - cx) + sin * (y - cy) + cx,
    ny = cos * (y - cy) - sin * (x - cx) + cy;
  return [nx, ny];
}

/**
 * Borrowing logic for rotating a point around the center axis: https://danceswithcode.net/engineeringnotes/rotations_in_2d/rotations_in_2d.html
 * @param x 
 * @param y 
 * @param cx 
 * @param cy 
 * @param angleDegree 
 * @returns 
 */
export function rotatePoint(
  x: number,     //X coords to rotate - replaced on return
  y: number,     //Y coords to rotate - replaced on return
  cx: number,      //X coordinate of center of rotation
  cy:number,      //Y coordinate of center of rotation
  angleDegree: number)   //Angle of rotation (radians, counterclockwise)
{
  const radians = (Math.PI * angleDegree)/ 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const nX = ((x-cx)*cos - (y-cy)*sin) + cx;  
  const nY = ((x - cx) * sin + (y - cy) * cos) + cy;
  
  return [nX, nY];
}

type WorldObjectProps = {
  id: string;
  width: number;
  height: number;
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
};

export class WorldObject extends BaseObject<WorldObjectProps, Paintable> {
  id: string;
  type = 'world-object';
  scale: number;
  layers: Paintable[];

  /**
   * This position in the world local to the scale of the object.
   * So a 1000x1000 drawn at 0.1 scale at x=5, y=10 on the world would have world points 50,100,1000,1000
   *
   * To get it's world-relative position you need to multiple the scale out.
   */
  points: Strand;

  /**
   * These are relative to where to object is in the world at the scale of the world.
   * So a 1000x1000 drawn at 0.1 scale at x=5, y=10 on the world would have world points 0,0,100,100
   */
  worldPoints: Strand;

  intersectionBuffer = dna(5);
  aggregateBuffer = dna(9);
  invertedBuffer = dna(9);
  rotation = 0;
  filteredPointsBuffer: Strand;
  _updatedList: any[] = [];
  geometry?: any;

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
      this.points = dna([1, x, y, x + props.width, y + props.height]);
      this.worldPoints = dna([1, x, y, x + props.width, y + props.height]);
      this.filteredPointsBuffer = dna(props.layers.length * 5);
    }
  }

  static createWithProps(props: WorldObjectProps) {
    const instance = new WorldObject();
    instance.applyProps(props);
    return instance;
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
    this.rotation = props.rotation || 0;

    this.worldPoints[3] = this.worldPoints[1] + props.width;
    this.worldPoints[4] = this.worldPoints[2] + props.height;

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
    item.__owner.value = this;

    this.addLayers([item]);
  }

  removeChild(item: Paintable) {
    this.layers = this.layers.filter((layer) => layer !== item);
    this.filteredPointsBuffer = dna(this.layers.length * 5);
  }

  insertBefore(item: Paintable, before: Paintable) {
    const index = this.layers.indexOf(before);
    if (index === -1) {
      return;
    }
    if (this.layers.indexOf(item) !== -1) {
      return;
    }

    // const beforeLayers = this.layers.slice(0, index - 1);
    const beforeLayers = this.layers.slice(0, index);
    const afterLayers = this.layers.slice(index);

    this.layers = [...beforeLayers, item, ...afterLayers];
  }

  hideInstance() {
    console.warn('hideInstance: not yet implemented');
  }

  getObjectsAt(target: Strand, all?: boolean): Paintable[] {
    if (this.rotation) {
      target = this.applyRotation(target);
    }

    const filteredPoints = hidePointsOutsideRegion(this.points, target, this.filteredPointsBuffer);
    if (filteredPoints[0] === 0) {
      return [];
    }

    const len = this.layers.length;
    const objects: Paintable[] = [];
    for (let index = 0; index < len; index++) {
      const layer = this.layers[index] as SpacialContent | WorldObject;

      if (all && (layer as Geometry).isShape) {
        const t = transform(layer.points, translate(this.x, this.y));
        const int = (layer as Geometry).intersects([target[1] - t[1], target[2] - t[2]]);
        if (!int) continue;
      }

      const filter = hidePointsOutsideRegion(
        transform(layer.points, translate(this.x, this.y)),
        target,
        this.filteredPointsBuffer
      );

      if (filter[0] !== 0) {
        objects.push(layer as SpacialContent);
      }

      if (all) {
        const object = layer as WorldObject;
        objects.push(...object.getObjectsAt(target, all));
      }
    }
    return objects;
  }

  applyRotation(target: Strand) {
    if (this.rotation) {
      const a = { x: target[1], y: target[2] };
      const b = { x: target[1], y: target[4] };
      const c = { x: target[3], y: target[2] };
      const d = { x: target[3], y: target[4] };

      const x = this.points[1] + (this.points[3] - this.points[1]) / 2;
      const y = this.points[2] + (this.points[4] - this.points[2]) / 2;

      const [x1, y1] = rotate(x, y, a.x, a.y, this.rotation);
      const [x2, y2] = rotate(x, y, b.x, b.y, this.rotation);
      const [x3, y3] = rotate(x, y, c.x, c.y, this.rotation);
      const [x4, y4] = rotate(x, y, d.x, d.y, this.rotation);

      const rx1 = Math.min(x1, x2, x3, x4);
      const rx2 = Math.max(x1, x2, x3, x4);
      const ry1 = Math.min(y1, y2, y3, y4);
      const ry2 = Math.max(y1, y2, y3, y4);

      return dna([target[0], rx1, ry1, rx2, ry2]);
    }
    return target;
  }

  getAllPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    const transformer = compose(translate(this.x, this.y), scale(this.scale), this.aggregateBuffer);

    if (this.rotation) {
      target = this.applyRotation(target);
    }

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
    const paintablesToAdd = [];
    for (const paintable of paintables) {
      if (this.layers.indexOf(paintable) !== -1) {
        continue;
      }
      paintablesToAdd.push(paintable);
      // Check for crop.
      if (
        paintable.points.length === 5 &&
        // Paint.x < 0
        (paintable.points[1] < this.worldPoints[1] / this.scale ||
          // Paint.y < 0
          paintable.points[2] < this.worldPoints[2] / this.scale ||
          // Paint.width > this.width
          paintable.points[3] > this.worldPoints[3] / this.scale ||
          // Paint.height > this.height
          paintable.points[4] > this.worldPoints[4] / this.scale)
      ) {
        // @todo support for tiled crops.
        paintable.crop =
          paintable.crop ||
          dna([
            1,
            Math.max(this.worldPoints[1] / this.scale, paintable.points[1]),
            Math.max(this.worldPoints[2] / this.scale, paintable.points[2]),
            Math.min(this.worldPoints[3] / this.scale, paintable.points[3]),
            Math.min(this.worldPoints[4] / this.scale, paintable.points[4]),
          ]);
      }
    }

    this.layers = this.layers.concat(paintablesToAdd);

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
