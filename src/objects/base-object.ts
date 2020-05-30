import { AtlasObjectModel } from '../aom';
import { PointerEvents, WorldTime } from '../types';
import { mutate, scaleAtOrigin, Strand, translate } from '@atlas-viewer/dna';
import { Paint } from '../world-objects/paint';

export abstract class BaseObject<Props = any, SupportedChildElements = never>
  implements AtlasObjectModel<Props, SupportedChildElements> {
  __revision = 0;
  // Base properties.
  eventHandlers: {
    [Name in keyof PointerEvents]: Array<PointerEvents[Name]>;
  };
  scale = 1;
  layers: SupportedChildElements[] = [];
  time: WorldTime[] = [];

  // To be set by implementation constructor.
  abstract id: string;
  abstract points: Strand;

  getObjectsAt(target: Strand): SupportedChildElements[] | Array<[SupportedChildElements, any[]]> {
    return [];
  }

  getAllPointsAt(target: Strand, aggregate: Strand, scale: number): Paint[] {
    return [];
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>> | null {
    return null;
  }

  protected constructor() {
    this.eventHandlers = {
      onClick: [],
      onPointerDown: [],
      onMouseLeave: [],
      onMouseMove: [],
      onPointerUp: [],
      onWheel: [],
    };
  }

  addEventListener<Name extends keyof PointerEvents>(name: Name, cb: PointerEvents[Name]) {
    if (this.eventHandlers[name].indexOf(cb) === -1) {
      this.eventHandlers[name].push(cb);
    }
  }

  removeEventListener<Name extends keyof PointerEvents>(name: Name, cb: PointerEvents[Name]) {
    if (this.eventHandlers[name].indexOf(cb) !== -1) {
      this.eventHandlers[name] = this.eventHandlers[name].filter(e => e !== cb);
    }
  }

  dispatchEvent<Name extends keyof PointerEvents>(name: Name, e: any) {
    const listeners = this.eventHandlers[name];
    const len = listeners ? listeners.length : 0;
    if (len) {
      for (let x = 0; x < len; x++) {
        listeners[x](e);
      }
    }
  }

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

  translate(x: number, y: number) {
    mutate(this.points, translate(x, y));
  }

  atScale(factor: number) {
    mutate(this.points, scaleAtOrigin(factor, this.x, this.y));
    this.scale *= factor;
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  abstract getProps(): Props;

  applyProps(props: Props): void {
    // do nothing.
    this.__revision++;
  }
  appendChild(item: SupportedChildElements): void {
    // do nothing.
  }
  removeChild(item: SupportedChildElements): void {
    // do nothing.
  }
  insertBefore(item: SupportedChildElements, before: SupportedChildElements): void {
    // do nothing.
  }
  hideInstance(): void {
    // do nothing.
  }
}
