import { GenericObjectProps, NodeDefinition } from './traits/generic-object';
import { HasStyles, HasStylesProps, hasStylesDefaults, applyHasStylesProps } from './traits/has-styles';
import { BaseObject } from './base.object';

export interface WorldProps extends GenericObjectProps, HasStylesProps {
  readonly type: 'world';
}

export class World extends BaseObject implements HasStyles {
  node!: NodeDefinition;
  readonly type = 'world';

  style: HasStyles['style'];
  interactive: boolean;
  isHTML: boolean;

  constructor() {
    super({ type: 'container' });

    // Styles.
    const { style } = hasStylesDefaults();
    this.style = style;

    // Custom
    this.interactive = true;
    this.isHTML = false;
  }

  applyProps(props: WorldProps): boolean {
    let didUpdate = false;

    didUpdate = didUpdate || super.applyProps(props);
    didUpdate = didUpdate || applyHasStylesProps(this, props);

    if (didUpdate) {
      this.revision.id++;
    }

    return didUpdate;
  }
}
