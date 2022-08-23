import { ObjectDefinition } from './_types';
import { Box, BoxObject, BoxProps } from './box';
import {
  applyTransitionalObjectProps,
  TransitionableObject,
  TransitionableObjectProps,
  transitionalObjectDefaults,
} from '../traits/transitional-object';
import { doesNotSupport } from '../helpers/invalid-object-functions';

interface AnimatedBoxObject extends BoxObject, TransitionableObject {}

interface AnimatedBoxProps extends BoxProps, TransitionableObjectProps {}

export const AnimatedBox: ObjectDefinition<AnimatedBoxObject, AnimatedBoxProps> = {
  tagName: 'animated-box',
  create() {
    return {
      ...Box.create(),
      tagName: 'animated-box',
      ...transitionalObjectDefaults(),
    };
  },
  applyProps(object, props, state) {
    let didUpdate = false;

    didUpdate = Box.applyProps(object, props, state) || didUpdate;
    didUpdate = applyTransitionalObjectProps(object, props) || didUpdate;

    return didUpdate;
  },
  append: doesNotSupport.append,
  insertBefore: doesNotSupport.insertBefore,
  remove: doesNotSupport.remove,
  prepareUpdate: doesNotSupport.prepareUpdate,
  mountHost: doesNotSupport.mountHost,
  createHost: doesNotSupport.createHost,
};
