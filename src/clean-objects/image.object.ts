import { GenericObjectProps, NodeDefinition } from './traits/generic-object';
import { HasStyles, hasStylesDefaults } from './traits/has-styles';
import { BaseObject } from './base.object';

type ImageStyles = {
  opacity?: number;
};

export interface ImageObjectProps extends GenericObjectProps {
  src: string;
  priority?: boolean;
  style?: ImageStyles;
}

export class ImageObject extends BaseObject implements HasStyles<ImageStyles> {
  node!: NodeDefinition;
  readonly type = 'image';
  src?: string;
  style: HasStyles<ImageStyles>['style'];

  constructor() {
    super({ type: 'node' });

    const { style } = hasStylesDefaults();
    this.style = style;
  }

  applyProps(props: ImageObjectProps): boolean {
    let didUpdate = false;

    didUpdate = didUpdate || super.applyProps(props);

    if (props.src !== this.src) {
      this.src = props.src;
      didUpdate = true;
    }

    if (didUpdate) {
      this.revision.id++;
    }

    return didUpdate;
  }
}
