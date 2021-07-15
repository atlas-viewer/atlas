import { DnaFactory, hidePointsOutsideRegion, mutate, scale, transform, Strand } from '@atlas-viewer/dna';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { Memoize } from 'typescript-memoize';
import { BaseObject } from '../objects/base-object';
import { SpacialContent } from './spacial-content';
import { stripInfoJson } from '../utils';

export class TiledImage extends BaseObject implements SpacialContent {
  readonly id: string;
  readonly type = 'spacial-content';
  readonly display: DisplayData;
  tileWidth: number;

  points: Strand;

  constructor(data: {
    url: string;
    scaleFactor: number;
    points: Strand;
    displayPoints?: Strand;
    tileWidth: number;
    width: number;
    height: number;
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
  }

  applyProps(props: any) {
    // @todo.
  }

  static fromTile(
    url: string,
    canvas: { width: number; height: number },
    tile: { width: number; height?: number },
    scaleFactor: number
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

    return new TiledImage({
      url,
      scaleFactor,
      points: pointsFactory.build(),
      displayPoints: displayPoints.build(),
      width: canvas.width,
      height: canvas.height,
      tileWidth: tile.width,
    });
  }

  @Memoize()
  getImageUrl(index: number): string {
    const im = this.points.slice(index * 5, index * 5 + 5);
    const x2 = im[3] - im[1];
    const y2 = im[4] - im[2];
    const w = Math.ceil(x2 / this.display.scale);

    return `${this.id}/${im[1]},${im[2]},${x2},${y2}/${w > this.tileWidth ? this.tileWidth : w},/0/default.jpg`;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scaleFactor?: number): Paint[] {
    const points = hidePointsOutsideRegion(this.points, target);
    return [[this as any, points, aggregate]];
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> | null {
    return null;
  }
}
