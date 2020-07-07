import { BaseObject } from './base-object';
import { dna, DnaFactory, scale, Strand, transform } from '@atlas-viewer/dna';
import { CanvasTextWrapperOptions } from 'canvas-text-wrapper';
import { SpacialContent } from '../spacial-content/spacial-content';
import { Paint } from '../world-objects/paint';

export type TextProps = CanvasTextWrapperOptions & {
  id: string;
  text: string;
  target: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color: string;
  backgroundColor: string;
  fontSize: number;
  fontFamily: string;
  interactive?: boolean;
};

export class Text extends BaseObject<TextProps> implements SpacialContent {
  getProps(): any {
    return {};
  }

  type: 'spacial-content' = 'spacial-content';
  id: string;
  points: Strand;
  color = '#000';
  backgroundColor?: string;
  text = '';
  display = {
    scale: 1,
    width: 100,
    height: 100,
    points: dna(5),
  };
  interactive = false;
  props: CanvasTextWrapperOptions & { interactive?: boolean } = {
    font: '18px Arial, sans-serif',
    lineHeight: 1,
    textAlign: 'left',
    verticalAlign: 'top',
    paddingX: 0,
    paddingY: 0,
    fitParent: false,
    lineBreak: 'auto',
    strokeText: false,
    sizeToFill: false,
    maxFontSizeToFill: undefined,
    allowNewLine: true,
    justifyLines: false,
    renderHDPI: false,
    textDecoration: 'none',
    interactive: false,
  };

  constructor() {
    super();
    this.id = '';
    this.points = dna(5);
  }

  getAllPointsAt(target: Strand, aggregate: Strand): Paint[] {
    return [[this as any, this.points, aggregate]];
  }

  applyProps({
    id,
    target,
    text,
    color,
    backgroundColor,
    fontSize = 18,
    interactive,
    fontFamily = 'Arial, sans-serif',
    ...props
  }: Partial<TextProps>) {
    props.font = `${fontSize}px ${fontFamily}`;

    this.interactive = interactive || false;

    if (typeof text !== 'undefined') {
      this.text = text || '';
    }
    if (color) {
      this.color = color;
    }
    if (backgroundColor) {
      this.backgroundColor = backgroundColor;
    }
    if (id) {
      this.id = id;
    }
    if (target) {
      this.points = DnaFactory.singleBox(target.width, target.height, target.x, target.y);
      this.display.points = this.points;
      this.display.width = target.width;
      this.display.height = target.height;
    }
    this.props = { ...this.props, ...props };
    // Bump revision.
    this.__revision++;
  }
}
