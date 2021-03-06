import { Paint } from './paint';
import { WorldObject } from './world-object';
import { Strand, dna } from '@atlas-viewer/dna';

export interface ZoneInterface {
  id: string;
  config: Required<ZoneConfig>;
  objects: WorldObject[];
  points: Strand;
  recalculateBounds(): void;
  getPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[];
}

export type ZoneConfig = {
  margin?: number;
};

const defaultConfig: Required<ZoneConfig> = {
  margin: 0,
};

export class Zone implements ZoneInterface {
  id: string;
  config: Required<ZoneConfig>;
  points: Strand;
  objects: WorldObject[];

  constructor(objects: [WorldObject, ...WorldObject[]], config: ZoneConfig = {}) {
    this.id = objects.map(obj => obj.id).join('$$');
    this.config = {
      ...defaultConfig,
      ...config,
    };

    this.points = dna(5);
    this.objects = objects;
    this.recalculateBounds();
  }

  recalculateBounds(): void {
    // To create the points we need to take the world objects and get the min x1, y1 and the max x2, y2
    // After that we need to add the margin around.
    // Zone is just a logical grouping of work objects, as such they can't change the positions of world objects
    // They can however be queries for visible points, like WorldObjects.
    this.points.set([
      1,
      Math.min(...this.objects.map(obj => (obj as WorldObject).points[1])) - this.config.margin,
      Math.min(...this.objects.map(obj => (obj as WorldObject).points[2])) - this.config.margin,
      Math.max(...this.objects.map(obj => (obj as WorldObject).points[3])) + this.config.margin,
      Math.max(...this.objects.map(obj => (obj as WorldObject).points[4])) + this.config.margin,
    ]);
  }

  getPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return [];
  }
}
