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

interface StyledContainerObject extends GenericObject<ContainerDefinition>, Evented, HasStyles, Revision {}

interface StyledContainerProps extends GenericObjectProps, EventListenerProps, HasStylesProps {}

export const StyledContainer: ObjectDefinition<StyledContainerObject, StyledContainerProps> = {
  tagName: 'styled-container',
  create() {
    return {
      ...genericObjectDefaults('styled-container', 'styled-container'),
      ...eventsDefaults(),
      ...revisionDefaults(),
      ...hasStylesDefaults(),
    };
  },
  applyProps(object: StyledContainerObject, props: StyledContainerProps) {
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
  mountHost: doesNotSupport.mountHost,
  createHost: doesNotSupport.createHost,
};
