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
} from '@atlas-viewer/dna';
import { dna as preciseDna, translate } from '../utility/precise-dna';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { BaseObject } from '../objects/base-object';
import { SpacialContent } from './spacial-content';
import { stripInfoJson } from '../utils';
import { ImageService } from '@iiif/presentation-3';
import { getSparseGridRange } from '../clean-objects/traits/sparse-grid';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Float32 is exact for integer pixels through 2^24. Only large tile grids need doubles.
function tileGrid(columns: number, rows: number, width: number, height: number) {
  const factory = DnaFactory.grid(columns, rows);
  if (Math.max(width, height) > 2 ** 24) factory.points = preciseDna(columns * rows * 5);
  return factory;
}

export class TiledImage extends BaseObject implements SpacialContent {
  readonly id: string;
  readonly type = 'spacial-content';
  readonly display: DisplayData;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  style: { opacity: number } = { opacity: 1 };
  points: Strand;
  service?: ImageService;
  format = 'jpg';
  crop2?: Strand;
  version3?: boolean;

  // Large pyramids keep a bounded viewport window instead of a full-image grid.
  private windowed?: { width: number; height: number; fullWidth: number; fullHeight: number };
  private tileWindow?: { x: number; y: number; columns: number; rows: number };
  tileUrl: string;
  constructor(data: {
    url: string;
    scaleFactor: number;
    points: Strand;
    displayPoints?: Strand;
    tileWidth: number;
    tileHeight: number;
    width: number;
    height: number;
    columns: number;
    rows: number;
    format?: string;
    id?: string;
    version3?: boolean;
  }) {
    super();
    this.tileUrl = stripInfoJson(data.url);
    this.id = data.id || `${this.tileUrl}--${data.scaleFactor}--${data.tileWidth}x${data.tileHeight}`;
    this.points = data.displayPoints ? data.displayPoints : transform(data.points, scale(data.scaleFactor));
    this.tileWidth = data.tileWidth;
    this.tileHeight = data.tileHeight;
    this.columns = data.columns;
    this.rows = data.rows;
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

    if (typeof props.version3 !== 'undefined') {
      this.version3 = props.version3;
    }

    if (props.crop) {
      this.cropData = props.crop;

      const crop = this.points.slice();
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
    const tileHeight = tile.height ?? tile.width;
    // Dimensions of full image (scaled).
    const fullWidth = useFloorCalc ? Math.floor(canvas.width / scaleFactor) : Math.ceil(canvas.width / scaleFactor);
    const fullHeight = useFloorCalc ? Math.floor(canvas.height / scaleFactor) : Math.ceil(canvas.height / scaleFactor);
    // number of points in the x direction.
    const mWidth = Math.ceil(fullWidth / tile.width);
    // number of points in the y direction
    const mHeight = Math.ceil(fullHeight / tileHeight);

    if (
      ![canvas.width, canvas.height, tile.width, tileHeight, scaleFactor].every(
        (value) => Number.isFinite(value) && value > 0
      )
    ) {
      throw new Error('IIIF image dimensions, tile dimensions and scale factor must be positive finite numbers');
    }

    const windowed = mWidth * mHeight > 256;
    const pointsFactory = tileGrid(windowed ? 0 : mWidth, windowed ? 0 : mHeight, fullWidth, fullHeight);
    const displayPoints = tileGrid(windowed ? 0 : mWidth, windowed ? 0 : mHeight, canvas.width, canvas.height);

    const ctx = service
      ? service['@context']
        ? Array.isArray(service['@context'])
          ? service['@context']
          : [service['@context']]
        : []
      : [];
    const isV3 =
      typeof version3 !== 'undefined' ? version3 : ctx.indexOf('http://iiif.io/api/image/3/context.json') !== -1;

    // Create matrix
    for (let y = 0; !windowed && y < mHeight; y++) {
      for (let x = 0; x < mWidth; x++) {
        const rx = x * tile.width;
        const ry = y * tileHeight;

        displayPoints.addPoints(
          rx * scaleFactor,
          ry * scaleFactor,
          x === mWidth - 1 ? canvas.width : (rx + tile.width) * scaleFactor,
          y === mHeight - 1 ? canvas.height : (ry + tileHeight) * scaleFactor
        );

        pointsFactory.addPoints(
          rx,
          ry,
          x === mWidth - 1 ? fullWidth : rx + tile.width,
          y === mHeight - 1 ? fullHeight : ry + tileHeight
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
      tileHeight,
      columns: mWidth,
      rows: mHeight,
      format,
      version3: isV3,
    });

    if (windowed) {
      tiledImage.windowed = { width: canvas.width, height: canvas.height, fullWidth, fullHeight };
    }

    tiledImage.applyProps({
      service,
      format,
    });

    return tiledImage;
  }

  /** Renderer indices refer to the allocated grid, not the full virtual image. */
  get renderColumns(): number {
    return this.tileWindow?.columns ?? this.columns;
  }
  get renderRows(): number {
    return this.tileWindow?.rows ?? this.rows;
  }

  getImageUrl(index: number): string {
    // Replace this with image service wrapper that recalculates its toString()
    // when SETTING new variables, so that this becomes just a return.
    // We can store these based on the index.

    const window = this.tileWindow;
    const source = this.windowed;
    const tileX = (window?.x || 0) + (index % this.renderColumns);
    const tileY = (window?.y || 0) + Math.floor(index / this.renderColumns);
    // Compute service regions in JS numbers, not float32 world coordinates.
    const im = source
      ? [
          1,
          tileX * this.tileWidth * this.display.scale,
          tileY * this.tileHeight * this.display.scale,
          Math.min(source.width, (tileX + 1) * this.tileWidth * this.display.scale),
          Math.min(source.height, (tileY + 1) * this.tileHeight * this.display.scale),
        ]
      : this.points.slice(index * 5, index * 5 + 5);
    const x2 = im[3] - im[1];
    const y2 = im[4] - im[2];
    const w = Math.ceil(x2 / this.display.scale);
    const h = Math.ceil(y2 / this.display.scale);

    let widthString = `${w > this.tileWidth ? this.tileWidth : w},`;

    if (this.version3) {
      widthString += `${h > this.tileHeight ? this.tileHeight : h}`;
    }

    return `${this.tileUrl}/${im[1]},${im[2]},${x2},${y2}/${widthString}/0/default.${this.format || 'jpg'}`;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scaleFactor?: number): Paint[] {
    if (this.windowed && !this.updateTileWindow(target)) return [];
    const source = this.crop || this.points;
    const points = hidePointsOutsideRegion(source, target, source.slice());
    for (let i = 0; i < source.length; i += 5) if (!source[i]) points[i] = 0;
    return [[this as any, points, aggregate]];
  }

  private updateTileWindow(target: Strand): boolean {
    const source = this.windowed!;
    const factor = this.display.scale;
    const tw = this.tileWidth * factor;
    const th = this.tileHeight * factor;
    const cropX = this.cropData?.x || 0;
    const cropY = this.cropData?.y || 0;
    const {
      columnStart: x1,
      rowStart: y1,
      columnEnd: x2,
      rowEnd: y2,
    } = getSparseGridRange(
      { columns: this.columns, rows: this.rows, tile: { width: tw, height: th } },
      { x: target[1] + cropX, y: target[2] + cropY, width: target[3] - target[1], height: target[4] - target[2] }
    );
    if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return false;
    // A too-fine level must never allocate an unbounded grid, even when called directly.
    if ((x2 - x1 + 4) * (y2 - y1 + 4) > 4096) return false;
    const previous = this.tileWindow;
    if (
      previous &&
      x1 >= previous.x &&
      y1 >= previous.y &&
      x2 <= previous.x + previous.columns &&
      y2 <= previous.y + previous.rows
    )
      return true;

    this.dispose();
    const x = Math.max(0, x1 - 2);
    const y = Math.max(0, y1 - 2);
    const columns = Math.min(this.columns, x2 + 2) - x;
    const rows = Math.min(this.rows, y2 + 2) - y;
    this.tileWindow = { x, y, columns, rows };
    const points = tileGrid(columns, rows, source.width, source.height);
    const pixels = tileGrid(columns, rows, source.fullWidth, source.fullHeight);
    for (let row = y; row < y + rows; row++) {
      for (let col = x; col < x + columns; col++) {
        points.addPoints(
          col * tw,
          row * th,
          Math.min(source.width, (col + 1) * tw),
          Math.min(source.height, (row + 1) * th)
        );
        pixels.addPoints(
          col * this.tileWidth,
          row * this.tileHeight,
          Math.min(source.fullWidth, (col + 1) * this.tileWidth),
          Math.min(source.fullHeight, (row + 1) * this.tileHeight)
        );
      }
    }
    this.points = points.build();
    this.display.points = pixels.build();
    this.crop = undefined;
    if (this.cropData) this.applyProps({ crop: this.cropData, format: this.format, service: this.service });
    return true;
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> {
    return [];
  }
}
