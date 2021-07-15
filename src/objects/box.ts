import { BaseObject } from './base-object';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../spacial-content/spacial-content';
import { Paint } from '../world-objects/paint';
import { nanoid } from 'nanoid';

export type BoxProps = {
  id: string;
  target: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  className?: string;
  backgroundColor?: string;
  border?: string;
  interactive?: boolean;
};

export class Box extends BaseObject<BoxProps> implements SpacialContent {
  id: string;
  type: 'spacial-content' = 'spacial-content';
  points: Strand;
  display = {
    scale: 1,
    width: -1,
    height: -1,
    points: dna(5),
  };

  props: {
    backgroundColor?: string;
    border?: string;
    interactive?: boolean;
    className?: string;
  } = {};

  constructor() {
    super();
    this.id = nanoid(12);
    this.points = dna(5);
  }

  getAllPointsAt(target: Strand, aggregate: Strand): Paint[] {
    // this.points[0] = 1;
    return [[this as any, this.points, aggregate]];
  }

  applyProps(props: Partial<BoxProps> = {}) {
    let didUpdate = false;

    if (props.interactive !== this.props.interactive) {
      didUpdate = true;
      this.props.interactive = props.interactive;
    }

    if (props.target) {
      if (
        props.target.width !== this.display.width ||
        props.target.height !== this.display.height ||
        props.target.x !== this.points[1] ||
        props.target.y !== this.points[2]
      ) {
        didUpdate = true;
        this.points = DnaFactory.singleBox(props.target.width, props.target.height, props.target.x, props.target.y);
        this.display.points = DnaFactory.singleBox(
          props.target.width,
          props.target.height,
          props.target.x,
          props.target.y
        );
        this.display.width = props.target.width;
        this.display.height = props.target.height;
      }
    }

    if (props.backgroundColor !== this.props.backgroundColor) {
      didUpdate = true;
      this.props.backgroundColor = props.backgroundColor;
    }

    if (props.border !== this.props.border) {
      didUpdate = true;
      this.props.border = props.border;
    }

    if (didUpdate) {
      // Bump revision.
      this.__revision++;
    }
  }
}
