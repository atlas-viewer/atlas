import {
  applyGenericObjectProps,
  ContainerDefinition,
  GenericObject,
  genericObjectDefaults,
  GenericObjectProps,
} from '../traits/generic-object';
import { applyEventProps, Evented, EventListenerProps, eventsDefaults } from '../traits/evented';
import { Revision, revisionDefaults } from '../traits/revision';
import { ObjectDefinition } from './_types';
import {
  applyTransitionalContainerProps,
  TransitionalContainer,
  transitionalContainerDefaults,
  TransitionalContainerProps,
} from '../traits/transitional-container';
import { append, insertBefore, remove } from '../traits/container';
import { doesNotSupport } from '../helpers/invalid-object-functions';

interface AnimationGroupObject extends GenericObject<ContainerDefinition>, Evented, Revision, TransitionalContainer {}

interface AnimationGroupProps extends GenericObjectProps, EventListenerProps, TransitionalContainerProps {}

export const AnimationGroup: ObjectDefinition<AnimationGroupObject, AnimationGroupProps> = {
  tagName: 'animation-group',
  create() {
    return {
      ...genericObjectDefaults('container', 'animation-group'),
      ...eventsDefaults(),
      ...revisionDefaults(),
      ...transitionalContainerDefaults(),
    };
  },
  applyProps(object: AnimationGroupObject, props: AnimationGroupProps) {
    let didUpdate = false;

    didUpdate = applyGenericObjectProps(object, props) || didUpdate;
    didUpdate = applyEventProps(object, props) || didUpdate;
    didUpdate = applyTransitionalContainerProps(object, props) || didUpdate;

    return didUpdate;
  },
  append,
  insertBefore,
  remove,
  prepareUpdate: doesNotSupport.prepareUpdate,
  mountHost: doesNotSupport.mountHost,
  createHost: doesNotSupport.createHost,
};
