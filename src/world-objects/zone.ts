import { dna, type Strand } from '@atlas-viewer/dna';
import type { Paint } from './paint';
import type { WorldObject } from './world-object';

export interface ZoneInterface {
  id: string;
  config: ZoneResolvedConfig;
  objects: WorldObject[];
  points: Strand;
  recalculateBounds(): void;
  getPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[];
}

export type ZoneConfig = {
  margin?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type ZoneResolvedConfig = {
  margin: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const defaultConfig: ZoneResolvedConfig = {
  margin: 0,
};

export class Zone implements ZoneInterface {
  id: string;
  config: ZoneResolvedConfig;
  points: Strand;
  objects: WorldObject[];

  constructor(objects: [WorldObject, ...WorldObject[]], config?: ZoneConfig);
  constructor(config: ZoneConfig & { id: string; objects?: WorldObject[] });
  constructor(
    objectsOrConfig: [WorldObject, ...WorldObject[]] | (ZoneConfig & { id: string; objects?: WorldObject[] }),
    config: ZoneConfig = {}
  ) {
    if (Array.isArray(objectsOrConfig)) {
      this.id = objectsOrConfig.map((obj) => obj.id).join('$$');
      this.config = {
        ...defaultConfig,
        ...config,
      };
      this.objects = [...objectsOrConfig];
    } else {
      this.id = objectsOrConfig.id;
      this.config = {
        ...defaultConfig,
        margin: typeof objectsOrConfig.margin === 'number' ? objectsOrConfig.margin : defaultConfig.margin,
        x: objectsOrConfig.x,
        y: objectsOrConfig.y,
        width: objectsOrConfig.width,
        height: objectsOrConfig.height,
      };
      this.objects = [...(objectsOrConfig.objects || [])];
    }

    this.points = dna(5);
    this.recalculateBounds();
  }

  applyProps(config: ZoneConfig & { id?: string }) {
    if (typeof config.id !== 'undefined') {
      this.id = config.id;
    }
    this.config = {
      ...this.config,
      ...config,
    };
    this.recalculateBounds();
  }

  addObject(object: WorldObject) {
    if (this.objects.indexOf(object) !== -1) {
      return;
    }
    this.objects.push(object);
    this.recalculateBounds();
  }

  removeObject(object: WorldObject) {
    this.objects = this.objects.filter((zoneObject) => zoneObject !== object);
    this.recalculateBounds();
  }

  recalculateBounds(): void {
    const hasManualBounds =
      Number.isFinite(this.config.x) &&
      Number.isFinite(this.config.y) &&
      Number.isFinite(this.config.width) &&
      Number.isFinite(this.config.height) &&
      (this.config.width as number) > 0 &&
      (this.config.height as number) > 0;

    if (!hasManualBounds) {
      this.points.set([0, 0, 0, 0, 0]);
      return;
    }

    const margin = this.config.margin;
    const x = this.config.x as number;
    const y = this.config.y as number;
    const width = this.config.width as number;
    const height = this.config.height as number;
    this.points.set([1, x - margin, y - margin, x + width + margin, y + height + margin]);
  }

  getPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return [];
  }
}
