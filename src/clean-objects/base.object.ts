import { SupportedEventNames, SupportedEvents } from '../events';
import {
  applyGenericObjectProps,
  ContainerDefinition,
  GenericObject,
  genericObjectDefaults,
  GenericObjectProps,
} from './traits/generic-object';
import {
  Evented,
  eventsDefaults,
  addEventListener,
  removeEventListener,
  dispatchEvent,
  EventListenerProps,
  applyEventProps,
  EventedHelpers,
} from './traits/evented';
import { Revision, revisionDefaults } from './traits/revision';
import { getAllPointsAt, getObjectsAt, Paint, PaintableObject } from './traits/paintable';
import { Strand } from '@atlas-viewer/dna';

export interface BaseObjectProps extends GenericObjectProps, EventListenerProps {}

export abstract class BaseObject implements GenericObject, Evented, EventedHelpers, Revision, PaintableObject {
  readonly id: GenericObject['id'];
  abstract readonly type: GenericObject['type'];
  readonly display: GenericObject['display'];
  readonly points: GenericObject['points'];
  readonly node: GenericObject['node'];
  readonly buffers: GenericObject['buffers'];
  revision: Revision['revision'];
  events: Evented['events'];

  protected constructor(options: { type: 'container' | 'node' }) {
    // Generic values.
    const { id, display, points, node, buffers } = genericObjectDefaults(options.type);
    this.id = id;
    this.display = display;
    this.points = points;
    this.node = node;
    this.buffers = buffers;

    // Events.
    const { events } = eventsDefaults();
    this.events = events;

    // Revision.
    const { revision } = revisionDefaults();
    this.revision = revision;
  }

  getObjectsAt(target: Strand, zone?: PaintableObject<ContainerDefinition<PaintableObject>>): PaintableObject[] {
    return getObjectsAt(this, target, { zone });
  }

  getAllPointsAt(target: Strand, scale: number, aggregate?: Strand): Paint[] {
    return getAllPointsAt(this, target, scale, { aggregate });
  }

  addEventListener<Name extends SupportedEventNames>(
    name: Name,
    cb: (e: any) => void,
    options?: { capture: boolean; passive: boolean }
  ): void {
    addEventListener(this, name, cb, options);
  }

  removeEventListener<Name extends SupportedEventNames>(name: Name, cb: (e: any) => void): void {
    removeEventListener(this, name, cb);
  }

  dispatchEvent<Name extends keyof SupportedEvents>(name: Name, e: any): boolean {
    return dispatchEvent(this, name, e, false);
  }

  captureEvent<Name extends keyof SupportedEvents>(name: Name, e: any): boolean {
    return dispatchEvent(this, name, e, true);
  }

  // BaseObjectProps
  applyProps(props: BaseObjectProps): boolean {
    let didUpdate = false;

    didUpdate = didUpdate || applyGenericObjectProps(this, props);
    didUpdate = didUpdate || applyEventProps(this, props);

    return didUpdate;
  }
}
