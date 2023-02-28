import {
  applyGenericObjectProps,
  ContainerDefinition,
  GenericObject,
  genericObjectDefaults,
  GenericObjectProps,
} from '../traits/generic-object';
import { applyEventProps, dispatchEvent, Evented, EventListenerProps, eventsDefaults } from '../traits/evented';
import { Revision, revisionDefaults } from '../traits/revision';
import { ObjectDefinition } from './_types';
import { layoutDefaults } from '../traits/layout';
import {
  applyTransitionalContainerProps,
  TransitionalContainer,
  transitionalContainerDefaults,
  TransitionalContainerProps,
} from '../traits/transitional-container';
import { append, insertBefore, remove } from '../traits/container';
import { doesNotSupport } from '../helpers/invalid-object-functions';

export interface WorldObject extends GenericObject<ContainerDefinition>, Evented, Revision, TransitionalContainer {}

export interface WorldProps extends GenericObjectProps, EventListenerProps, TransitionalContainerProps {}

export const World: ObjectDefinition<WorldObject, WorldProps> = {
  tagName: 'world',
  create() {
    return {
      ...genericObjectDefaults('container', 'world'),
      ...eventsDefaults(),
      ...revisionDefaults(),
      ...layoutDefaults(),
      ...transitionalContainerDefaults(),
    };
  },
  applyProps(object: WorldObject, props: WorldProps) {
    let didUpdate = false;

    didUpdate = applyGenericObjectProps(object, props) || didUpdate;
    didUpdate = applyEventProps(object, props) || didUpdate;
    didUpdate = applyTransitionalContainerProps(object, props) || didUpdate;

    if (didUpdate) {
      dispatchEvent(object, 'onUpdate');
    }

    return didUpdate;
  },
  append,
  insertBefore,
  remove,
  prepareUpdate: doesNotSupport.prepareUpdate,
  mountHost: doesNotSupport.mountHost,
  createHost: doesNotSupport.createHost,
};
