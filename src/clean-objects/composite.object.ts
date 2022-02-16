import { GenericObject } from './traits/generic-object';

export interface CompositeObjectProps extends GenericObject {
  readonly type: 'composite';
}
