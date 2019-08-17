import { WorldTime } from '../types';
import { Paint, Paintable } from './paint';
import { AbstractWorldObject } from './abstract-world-object';
import { AbstractObject } from './abstract-object';
import { Strand, dna, compose, getIntersection, mutate, scale, scaleAtOrigin, transform, translate } from '@atlas-viewer/dna';

export class WorldObject implements AbstractWorldObject {
  id: string;
  scale: number;
  layers: Paintable[];
  time: WorldTime[];
  points: Strand;
  intersectionBuffer = dna(5);
  aggregateBuffer = dna(9);
  invertedBuffer = dna(9);

  get x(): number {
    return this.points[1];
  }
  get y(): number {
    return this.points[2];
  }
  get width(): number {
    return this.points[3] - this.points[1];
  }
  get height(): number {
    return this.points[4] - this.points[2];
  }

  constructor(props: AbstractObject) {
    this.id = props.id;
    this.scale = 1;
    this.layers = props.layers;
    this.time = [];
    this.points = dna([1, 0, 0, props.width, props.height]);
  }

  getAllPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    const transformer = compose(
      translate(this.x, this.y),
      scale(this.scale),
      this.aggregateBuffer
    );

    const inter = getIntersection(target, this.points, this.intersectionBuffer);
    const len = this.layers.length;
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr[i] = this.layers[i].getPointsAt(
        // Crop intersection.
        transform(
          inter,
          compose(
            scale(1 / this.scale),
            translate(-this.x, -this.y),
            this.invertedBuffer
          )
        ),
        aggregate
          ? compose(
              aggregate,
              transformer,
              this.aggregateBuffer
            )
          : transformer,
        scaleFactor * this.scale
      );
    }
    return arr;
  }

  translate(x: number, y: number) {
    mutate(this.points, translate(x, y));
  }

  atScale(factor: number) {
    mutate(this.points, scaleAtOrigin(factor, this.x, this.y));
    this.scale *= factor;
  }

  addLayers(paintables: Paintable[]) {
    this.layers = this.layers.concat(paintables);
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> {
    const len = this.layers.length;
    const list = [];
    for (let i = 0; i < len; i++) {
      const updates = this.layers[i].getScheduledUpdates(target, scaleFactor * this.scale);
      if (updates) {
        list.push(...updates);
      }
    }
    return list;
  }
}
