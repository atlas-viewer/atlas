import {
  DnaFactory,
  hidePointsOutsideRegion,
  mutate,
  scale,
  transform,
  Strand,
  dna,
  getIntersection,
} from '@atlas-viewer/dna';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { BaseObject } from '../objects/base-object';
import { SpacialContent } from './spacial-content';
import { stripInfoJson } from '../utils';
import { ImageService } from '@iiif/presentation-3';

export class TiledImage extends BaseObject implements SpacialContent {
  readonly id: string;
  readonly type = 'spacial-content';
  readonly display: DisplayData;
  tileWidth: number;
  style: { opacity: number } = { opacity: 1 };
  points: Strand;
  service?: ImageService;
  format = 'jpg';
  crop2?: Strand;
  constructor(data: {
    url: string;
    scaleFactor: number;
    points: Strand;
    displayPoints?: Strand;
    tileWidth: number;
    width: number;
    height: number;
    format?: string;
  }) {
    super();
    this.id = stripInfoJson(data.url);
    this.points = data.displayPoints ? data.displayPoints : transform(data.points, scale(data.scaleFactor));
    this.tileWidth = data.tileWidth;
    this.display = {
      width: data.width / data.scaleFactor,
      height: data.height / data.scaleFactor,
      points: data.points,
      scale: data.scaleFactor,
    };
    if (data.format) {
      this.format = data.format;
    }
  }

  applyProps(props: any) {
    if (props.style && typeof props.style.opacity !== 'undefined') {
      this.style.opacity = props.style.opacity;
    }
    if (props.service !== this.service) {
      this.service = props.service;
    }
    if (props.format) {
      this.format = props.format;
    } else {
      this.format = 'jpg';
    }

    if (props.crop) {
      const crop = DnaFactory.projection({
        width: this.display.width * this.display.scale,
        height: this.display.height * this.display.scale,
        x: 0,
        y: 0,
      });

      // const hidden = dna(this.points.length);
      // const len = hidden.length / 5;
      //
      // for (let i = 0; i < len; i++) {
      //   hidden[i * 5 + 0] = 1;
      //   // hidden[i * 5 + 3] = hidden[i * 5 + 3] - hidden[i * 5 + 1];
      //   // hidden[i * 5 + 4] = hidden[i * 5 + 4] - hidden[i * 5 + 2];
      //   // hidden[i * 5 + 1] = 0;
      //   // hidden[i * 5 + 2] = 0;
      // }
      //
      // this.crop = hidden;

      if (!this.crop2) {
        this.crop2 = crop;
      } else {
        this.crop2.set(crop);
      }

      console.log('crop', crop);
    }
  }

  static fromTile(
    url: string,
    canvas: { width: number; height: number },
    tile: { width: number; height?: number },
    scaleFactor: number,
    service?: ImageService,
    format?: string
  ): TiledImage {
    // Always set a height.
    tile.height = tile.height ? tile.height : tile.width;
    // Dimensions of full image (scaled).
    const fullWidth = Math.ceil(canvas.width / scaleFactor);
    const fullHeight = Math.ceil(canvas.height / scaleFactor);
    // number of points in the x direction.
    const mWidth = Math.ceil(fullWidth / tile.width);
    // number of points in the y direction
    const mHeight = Math.ceil(fullHeight / tile.height);

    const pointsFactory = DnaFactory.grid(mWidth, mHeight);
    const displayPoints = DnaFactory.grid(mWidth, mHeight);

    // Create matrix
    for (let y = 0; y < mHeight; y++) {
      for (let x = 0; x < mWidth; x++) {
        const rx = x * tile.width;
        const ry = y * tile.height;

        displayPoints.addPoints(
          rx * scaleFactor,
          ry * scaleFactor,
          x === mWidth - 1 ? canvas.width : (rx + tile.width) * scaleFactor,
          y === mHeight - 1 ? canvas.height : (ry + tile.height) * scaleFactor
        );

        pointsFactory.addPoints(
          rx,
          ry,
          x === mWidth - 1 ? fullWidth : rx + tile.width,
          y === mHeight - 1 ? fullHeight : ry + tile.height
        );
      }
    }

    const tiledImage = new TiledImage({
      url,
      scaleFactor,
      points: pointsFactory.build(),
      displayPoints: displayPoints.build(),
      width: canvas.width,
      height: canvas.height,
      tileWidth: tile.width,
      format,
    });

    tiledImage.applyProps({
      service,
    });

    return tiledImage;
  }

  getImageUrl(index: number): string {
    // Replace this with image service wrapper that recalculates its toString()
    // when SETTING new variables, so that this becomes just a return.
    // We can store these based on the index.

    const im = this.points.slice(index * 5, index * 5 + 5);
    const x2 = im[3] - im[1];
    const y2 = im[4] - im[2];
    const w = Math.ceil(x2 / this.display.scale);

    return `${this.id}/${im[1]},${im[2]},${x2},${y2}/${w > this.tileWidth ? this.tileWidth : w},/0/default.${
      this.format || 'jpg'
    }`;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scaleFactor?: number): Paint[] {
    if (this.crop2) {
      const inter = getIntersection(target, this.crop2);
      if (inter[1] === 0 && inter[2] === 0 && inter[3] === 0 && inter[4] === 0) {
        return [];
      }
      const points = hidePointsOutsideRegion(this.points, inter);
      return [[this as any, points, aggregate]];
    }

    const points = hidePointsOutsideRegion(this.points, target);
    return [[this as any, points, aggregate]];
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> {
    return [];
  }
}
