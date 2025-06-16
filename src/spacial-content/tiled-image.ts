import {
  DnaFactory,
  hidePointsOutsideRegion,
  mutate,
  scale,
  transform,
  Strand,
  dna,
  getIntersection,
  Projection,
  translate,
} from '@atlas-viewer/dna';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { BaseObject } from '../objects/base-object';
import { SpacialContent } from './spacial-content';
import { stripInfoJson } from '../utils';
import { ImageService } from '@iiif/presentation-3';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
  version3?: boolean;

  tileUrl: string;
  constructor(data: {
    url: string;
    scaleFactor: number;
    points: Strand;
    displayPoints?: Strand;
    tileWidth: number;
    width: number;
    height: number;
    format?: string;
    id?: string;
    version3?: boolean;
  }) {
    super();
    this.tileUrl = stripInfoJson(data.url);
    this.id = data.id || `${this.tileUrl}--${data.scaleFactor}`;
    this.points = data.displayPoints ? data.displayPoints : transform(data.points, scale(data.scaleFactor));
    this.tileWidth = data.tileWidth;
    this.version3 = data.version3;
    this.display = {
      x: 0,
      y: 0,
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
      this.cropData = props.crop;

      const crop = dna([...this.points]);
      const len = crop.length / 5;

      const minX = props.crop.x || 0;
      const minY = props.crop.y || 0;
      const maxX = props.crop.x + props.crop.width;
      const maxY = props.crop.y + props.crop.height;

      for (let i = 0; i < len; i++) {
        const index = i * 5;
        if (
          /* x1 */ crop[index + 1] < maxX && // x1 left - x2 right
          /* x2 */ crop[index + 3] > minX && // x2 right - x1 left
          /* y1 */ crop[index + 2] < maxY && // y1 top - y2 bottom
          /* y2 */ crop[index + 4] > minY // y2 bottom - y1 top
        ) {
          crop[index + 1] = clamp(crop[index + 1], minX, maxX);
          crop[index + 3] = clamp(crop[index + 3], minX, maxX);
          crop[index + 2] = clamp(crop[index + 2], minY, maxY);
          crop[index + 4] = clamp(crop[index + 4], minY, maxY);
        } else {
          crop[index] = 0;
        }
      }

      mutate(crop, translate(-props.crop.x, -props.crop.y));

      if (!this.crop) {
        this.crop = crop;
      } else {
        this.crop.set(crop);
      }
    }
  }

  static fromTile(
    url: string,
    canvas: { width: number; height: number },
    tile: { width: number; height?: number },
    scaleFactor: number,
    service?: ImageService,
    format?: string,
    useFloorCalc?: boolean,
    version3?: boolean
  ): TiledImage {
    // Always set a height.
    tile.height = tile.height ? tile.height : tile.width;
    // Dimensions of full image (scaled).
    const fullWidth = useFloorCalc ? Math.floor(canvas.width / scaleFactor) : Math.ceil(canvas.width / scaleFactor);
    const fullHeight = useFloorCalc ? Math.floor(canvas.height / scaleFactor) : Math.ceil(canvas.height / scaleFactor);
    // number of points in the x direction.
    const mWidth = Math.ceil(fullWidth / tile.width);
    // number of points in the y direction
    const mHeight = Math.ceil(fullHeight / tile.height);

    const pointsFactory = DnaFactory.grid(mWidth, mHeight);
    const displayPoints = DnaFactory.grid(mWidth, mHeight);

    const ctx = service ? service['@context']
          ? Array.isArray(service['@context'])
            ? service['@context']
            : [service['@context']]
          : [] : [];
    const isV3 = typeof version3 !== 'undefined' ? version3 : ctx.indexOf('http://iiif.io/api/image/3/context.json') !== -1;

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
      version3: isV3,
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
    const h = Math.ceil(y2 / this.display.scale);

    let widthString = `${w > this.tileWidth ? this.tileWidth : w},`;

    if (this.version3) {
      widthString += `${h > this.tileWidth ? this.tileWidth : h}`;
    }

    return `${this.tileUrl}/${im[1]},${im[2]},${x2},${y2}/${widthString}/0/default.${this.format || 'jpg'
      }`;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scaleFactor?: number): Paint[] {
    const points = hidePointsOutsideRegion(this.crop || this.points, target);
    return [[this as any, points, aggregate]];
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> {
    return [];
  }
}
