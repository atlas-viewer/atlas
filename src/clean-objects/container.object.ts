import { BaseObject, BaseObjectProps } from './base.object';
import { HasStyles, hasStylesDefaults, HasStylesProps } from './traits/has-styles';
import { ContainerDefinition } from './traits/generic-object';

export interface ContainerObjectProps extends HasStylesProps, BaseObjectProps {}

export class ContainerObject extends BaseObject implements HasStyles {
  node!: ContainerDefinition<any>;
  readonly type = 'container';
  readonly style: HasStyles['style'];

  constructor() {
    super({ type: 'container' });

    const { style } = hasStylesDefaults();
    this.style = style;
  }
}
