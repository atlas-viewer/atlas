import {
  applyGenericObjectProps,
  ContainerDefinition,
  GenericObject,
  genericObjectDefaults,
  GenericObjectProps,
} from '../traits/generic-object';
import { applyEventProps, Evented, EventListenerProps, eventsDefaults } from '../traits/evented';
import { Revision, revisionDefaults } from '../traits/revision';
import { applyHasStylesProps, HasStyles, hasStylesDefaults, HasStylesProps } from '../traits/has-styles';
import { ObjectDefinition } from './_types';
import { append, insertBefore, remove } from '../traits/container';
import { doesNotSupport } from '../helpers/invalid-object-functions';

interface ContainerObject extends GenericObject<ContainerDefinition>, Evented, HasStyles, Revision {}

interface ContainerProps extends GenericObjectProps, EventListenerProps, HasStylesProps {}

export const Container: ObjectDefinition<ContainerObject, ContainerProps> = {
  tagName: 'container',
  create() {
    return {
      ...genericObjectDefaults('container', 'container'),
      ...eventsDefaults(),
      ...revisionDefaults(),
      ...hasStylesDefaults(),
    };
  },
  applyProps(object: ContainerObject, props: ContainerProps) {
    let didUpdate = false;

    didUpdate = applyGenericObjectProps(object, props) || didUpdate;
    didUpdate = applyEventProps(object, props) || didUpdate;
    didUpdate = applyHasStylesProps(object, props) || didUpdate;

    return didUpdate;
  },
  append,
  insertBefore,
  remove,
  prepareUpdate: doesNotSupport.prepareUpdate,
};
