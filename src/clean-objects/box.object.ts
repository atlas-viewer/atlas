import { GenericObjectProps, NodeDefinition } from './traits/generic-object';
import { HasStyles, HasStylesProps, hasStylesDefaults, applyHasStylesProps } from './traits/has-styles';
import { BaseObject } from './base.object';

export interface BoxProps extends GenericObjectProps, HasStylesProps {
  readonly type: 'box';
  interactive?: boolean;
  html?: boolean;
}

export class Box extends BaseObject implements HasStyles {
  node!: NodeDefinition;
  readonly type = 'box';

  style: HasStyles['style'];
  interactive: boolean;
  isHTML: boolean;

  constructor() {
    super({ type: 'node' });

    // Styles.
    const { style } = hasStylesDefaults();
    this.style = style;

    // Custom
    this.interactive = true;
    this.isHTML = false;
  }

  applyProps(props: BoxProps): boolean {
    let didUpdate = false;

    didUpdate = didUpdate || super.applyProps(props);
    didUpdate = didUpdate || applyHasStylesProps(this, props);

    if (props.interactive !== this.interactive) {
      this.interactive = props.interactive || false;
      didUpdate = true;
    }

    if (props.html !== this.isHTML) {
      this.isHTML = props.html || false;
      didUpdate = true;
    }

    if (didUpdate) {
      this.revision.id++;
    }

    return didUpdate;
  }
}
