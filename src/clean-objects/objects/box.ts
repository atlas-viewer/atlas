import {
  applyGenericObjectProps,
  GenericObject,
  genericObjectDefaults,
  GenericObjectProps,
} from '../traits/generic-object';
import { applyEventProps, Evented, EventListenerProps, eventsDefaults } from '../traits/evented';
import { Revision, revisionDefaults } from '../traits/revision';
import { applyHasStylesProps, HasStyles, hasStylesDefaults, HasStylesProps } from '../traits/has-styles';
import { ObjectDefinition } from './_types';
import { doesNotSupport } from '../helpers/invalid-object-functions';
import { hostDefaults } from '../traits/host';

export interface BoxObject extends GenericObject, Evented, HasStyles, Revision {}

export interface BoxProps extends GenericObjectProps, EventListenerProps, HasStylesProps {}

export const Box: ObjectDefinition<BoxObject, BoxProps> = {
  tagName: 'box',
  create() {
    return {
      ...genericObjectDefaults('node', 'box'),
      ...eventsDefaults(),
      ...revisionDefaults(),
      ...hasStylesDefaults(),
      ...hostDefaults(),
    };
  },
  applyProps(object, props) {
    let didUpdate = false;

    didUpdate = applyGenericObjectProps(object, props) || didUpdate;
    didUpdate = applyEventProps(object, props) || didUpdate;
    didUpdate = applyHasStylesProps(object, props) || didUpdate;

    return didUpdate;
  },
  append: doesNotSupport.append,
  insertBefore: doesNotSupport.insertBefore,
  remove: doesNotSupport.remove,
  prepareUpdate: doesNotSupport.prepareUpdate,
  mountHost: doesNotSupport.mountHost,
  createHost: doesNotSupport.createHost,
};
