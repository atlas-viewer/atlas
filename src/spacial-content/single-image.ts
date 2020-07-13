import { SpacialContent } from './spacial-content';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { DisplayData, SpacialSize } from '../types';
import { BaseObject } from '../objects/base-object';
import { Paint } from '../world-objects/paint';

type SingleImageProps = {
  uri: string;
  id?: string;
  display?: { width: number; height: number };
  target: { width: number; height: number };
  scale?: number;
};

export class SingleImage extends BaseObject implements SpacialContent {
  readonly type = 'spacial-content';
  id: string;
  uri: string;
  display: DisplayData;
  points: Strand;

  constructor(data?: { id?: string; uri: string; width: number; height: number; scale?: number }) {
    super();

    if (!data) {
      this.id = '';
      this.uri = '';
      this.display = { scale: 1, width: 0, height: 0, points: dna(5) };
      this.points = dna(5);
    } else {
      const scale = data.scale || 1;
      this.id = data.id || data.uri;
      this.uri = data.uri;
      this.points = DnaFactory.singleBox(data.width, data.height);

      this.display = {
        scale: scale,
        width: data.width / scale,
        height: data.height / scale,
        points: scale !== 1 ? DnaFactory.singleBox(data.width / scale, data.height / scale) : this.points,
      };
    }
  }

  applyProps(props: SingleImageProps) {
    const width = props.display ? props.display.width : props.target.width;
    const scale = props.target.width / width;

    this.id = props.id || props.uri;
    this.uri = props.uri;
    this.points.set(DnaFactory.singleBox(props.target.width, props.target.height));

    this.display.scale = scale;
    this.display.width = props.target.width / scale;
    this.display.height = props.target.height / scale;
    this.display.points =
      scale !== 1 ? DnaFactory.singleBox(props.target.width / scale, props.target.height / scale) : this.points;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    return [[this as any, this.points, aggregate]];
  }

  // This works, but should be improved.
  // It should create a layered image similar to IIIF with different scale factors of the SVG.
  // And implement its own get points function, to return the right layer.
  // Would also be great if the ID field wasn't the entire SVG.
  static fromSvg(svg: string, target: SpacialSize, display?: SpacialSize, id?: string): SingleImage {
    return SingleImage.fromImage('data:image/svg+xml;base64,' + btoa(svg), target, display, id);
  }

  static fromImage(uri: string, target: SpacialSize, display?: SpacialSize, id?: string): SingleImage {
    const instance = new SingleImage();

    instance.applyProps({
      uri,
      id,
      display,
      target,
    });

    return instance;
  }

  getImageUrl() {
    return this.uri;
  }

  getProps(): any {
    return {};
  }
}
