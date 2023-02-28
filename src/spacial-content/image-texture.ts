import { SpacialContent } from './spacial-content';
import { DisplayData } from '../types';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { Paint } from '../world-objects/paint';
import { BaseObject } from '../objects/base-object';

export type UpdateTextureFunction = () => { source: TexImageSource | undefined; hash: any };

export type ImageTextureProps = {
  id: string;
  display?: { width: number; height: number };
  target: { width: number; height: number };
  scale?: number;
  getTexture: UpdateTextureFunction;
};

export class ImageTexture extends BaseObject implements SpacialContent {
  readonly type = 'spacial-content';
  id: string;
  uri: string;
  display: DisplayData;
  points: Strand;
  getTexture: UpdateTextureFunction;

  constructor(data?: { id?: string; uri: string; width: number; height: number; scale?: number }) {
    super();

    this.getTexture = () => {
      // no-op
      return { source: undefined, hash: -1 };
    };

    if (!data) {
      this.id = '';
      this.uri = '';
      this.display = { x: 0, y: 0, scale: 1, width: 0, height: 0, points: dna(5) };
      this.points = dna(5);
    } else {
      const scale = data.scale || 1;
      this.id = data.id || data.uri;
      this.uri = data.uri;
      this.points = DnaFactory.singleBox(data.width, data.height);

      this.display = {
        x: 0,
        y: 0,
        scale: scale,
        width: data.width / scale,
        height: data.height / scale,
        points: scale !== 1 ? DnaFactory.singleBox(data.width / scale, data.height / scale) : this.points,
      };
    }
  }

  applyProps(props: ImageTextureProps) {
    const width = props.display ? props.display.width : props.target.width;
    const scale = props.target.width / width;

    this.id = props.id;
    this.points.set(DnaFactory.singleBox(props.target.width, props.target.height));

    this.display.scale = scale;
    this.display.width = props.target.width / scale;
    this.display.height = props.target.height / scale;
    this.getTexture = props.getTexture;
    this.display.points =
      scale !== 1 ? DnaFactory.singleBox(props.target.width / scale, props.target.height / scale) : this.points;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    return [[this as any, this.points, aggregate]];
  }
}
