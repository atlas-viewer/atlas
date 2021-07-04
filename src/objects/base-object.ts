import { AtlasObjectModel } from '../aom';
import { WorldTime } from '../types';
import { mutate, scaleAtOrigin, Strand, translate } from '@atlas-viewer/dna';
import { Paint } from '../world-objects/paint';
import { nanoid } from 'nanoid';
import { CompositeResource } from '../spacial-content/composite-resource';
import {
  createDefaultEventMap,
  SupportedEventMap,
  supportedEventMap,
  SupportedEventNames,
  SupportedEvents,
} from '../events';

export abstract class BaseObject<Props = any, SupportedChildElements = never>
  implements AtlasObjectModel<Props, SupportedChildElements> {
  __id: string;
  __revision = 0;
  __host: any;
  __onCreate?: () => void;
  __parent?: CompositeResource;
  // Base properties.
  eventHandlers: SupportedEventMap;
  scale = 1;
  layers: SupportedChildElements[] = [];
  time: WorldTime[] = [];

  // To be set by implementation constructor.
  id: string;
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
    this.id = this.__id = nanoid();
    this.eventHandlers = createDefaultEventMap();
  }

  addEventListener = <Name extends SupportedEventNames>(
    name: Name,
    cb: (e: any) => void,
    options?: { capture: boolean; passive: boolean }
  ) => {
    const event: keyof SupportedEvents = supportedEventMap[name];
    if (!this.eventHandlers[event]) {
      throw new Error(`Unknown event ${event}`);
    }

    if (this.eventHandlers[event].indexOf(cb) === -1) {
      this.eventHandlers[event].push(cb);
    }
  };

  removeEventListener = <Name extends SupportedEventNames>(name: Name, cb: (e: any) => void) => {
    const event = supportedEventMap[name];
    if (!this.eventHandlers[event]) {
      console.warn(`Unknown event ${event}`);
      return;
    }
    if (this.eventHandlers[event].indexOf(cb) !== -1) {
      this.eventHandlers[event] = (this.eventHandlers[event] as any).filter((e: any) => e !== cb);
    }
  };

  dispatchEvent<Name extends keyof SupportedEvents>(name: Name, e: any) {
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
