import { compose, dna, translate, type Strand } from '@atlas-viewer/dna';
import {
  MapMeshBudgetError,
  sampleForwardMapMesh,
  tileForwardMapMesh,
  type WarpedMapMeshTile,
} from '../modules/maps/warped/map-mesh';
import { validateResourceMask, type WarpMeshOptions } from '../modules/maps/warped/mesh';
import type { WarpTransformer } from '../modules/maps/warped/types';
import { resolveTileUrl } from '../modules/maps/tile-source';
import type { MapTileSource, WorldRect } from '../modules/maps/types';
import type { Paint } from '../world-objects';
import { CompositeResource } from './composite-resource';
import { TiledImage } from './tiled-image';
import type { SpacialContent } from './spacial-content';

export type WarpedMapResourceProps = {
  id: string;
  /** Full-resolution IIIF image dimensions. The layer uses these image pixel coordinates. */
  imageWidth: number;
  imageHeight: number;
  transformer: WarpTransformer;
  tileSource?: MapTileSource;
  /** Change this to invalidate tiles supplied by a function source. */
  tileSourceKey?: string | number;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  maxTiles?: number;
  /** Mesh cells along the longest side of the viewport window (1..256). */
  resolution?: number;
  resourceMask?: WarpMeshOptions['resourceMask'];
  opacity?: number;
  useDevicePixelRatio?: boolean;
  onError?: (error: Error) => void;
};

export function validateWarpedMapLayer(props: WarpedMapResourceProps): void {
  for (const value of [props.imageWidth, props.imageHeight]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Image dimensions must be finite and greater than zero');
  }
  for (const value of [props.minZoom ?? 0, props.maxZoom ?? 19]) {
    if (!Number.isInteger(value) || value < 0 || value > 22)
      throw new Error('Map zoom must be an integer between 0 and 22');
  }
  if ((props.minZoom ?? 0) > (props.maxZoom ?? 19)) throw new Error('minZoom must not exceed maxZoom');
  for (const value of [props.tileSize ?? 256, props.maxTiles ?? 256]) {
    if (!Number.isInteger(value) || value <= 0) throw new Error('Tile size and tile budget must be positive integers');
  }
  if (
    props.resolution !== undefined &&
    (!Number.isInteger(props.resolution) || props.resolution < 1 || props.resolution > 256)
  ) {
    throw new Error('Warp resolution must be an integer between 1 and 256');
  }
  if (props.opacity !== undefined && (!Number.isFinite(props.opacity) || props.opacity < 0 || props.opacity > 1)) {
    throw new Error('Opacity must be between 0 and 1');
  }
  validateResourceMask(props.resourceMask);
}

/** One zoom/window, using the same decoded-tile loader and mesh renderer as warped IIIF images. */
class WarpedMapImage extends TiledImage {
  readonly isWarped = true;
  readonly compositeOpacity = true;
  constructor(
    id: string,
    readonly tiles: WarpedMapMeshTile[],
    readonly urls: string[],
    size: number,
    props: WarpedMapResourceProps
  ) {
    super({
      id,
      url: 'warped://map',
      scaleFactor: tiles[0]?.mesh.unitsPerPixel || 1,
      points: dna(tiles.length ? tiles.flatMap(() => [1, 0, 0, size, size]) : [0, 0, 0, 0, 0]),
      displayPoints: dna(
        tiles.length
          ? tiles.flatMap(({ mesh: { bounds } }) => [1, bounds.x1, bounds.y1, bounds.x2, bounds.y2])
          : [0, 0, 0, 0, 0]
      ),
      tileWidth: size,
      tileHeight: size,
      width: props.imageWidth,
      height: props.imageHeight,
      columns: tiles.length,
      rows: 1,
      format: 'png',
    });
    this.style.opacity = props.opacity ?? 1;
  }
  getImageUrl(index: number) {
    return this.urls[index] || '';
  }
  getWarpTile(index: number) {
    return this.tiles[index]?.mesh;
  }
}

/** An OSM/XYZ overlay whose destination is an unchanged IIIF image. */
export class WarpedMapResource extends CompositeResource {
  private config: WarpedMapResourceProps;
  private target?: WorldRect;
  private windowRect?: WorldRect;
  private viewportScale = 0;
  private builtScale = 0;
  private dirty = true;
  private generation = 0;
  private loadedFallback?: SpacialContent;
  zoom = 0;

  private replaceImages(images: SpacialContent[]) {
    for (const image of this.allImages) {
      if (!images.includes(image)) image.dispose?.();
    }
    this.allImages = images;
  }

  constructor(props: WarpedMapResourceProps) {
    validateWarpedMapLayer(props);
    super({
      id: props.id,
      width: props.imageWidth,
      height: props.imageHeight,
      images: [],
      renderOptions: {
        layerPolicy: 'fallback-only',
        renderSmallestFallback: false,
        fadeInMs: 0,
        minScaleGap: 0,
        clipToBounds: true,
      },
    });
    this.config = props;
  }

  applyProps(props: WarpedMapResourceProps) {
    const next = { ...this.config, ...props };
    validateWarpedMapLayer(next);
    const keys = [
      'imageWidth',
      'imageHeight',
      'transformer',
      'tileSource',
      'tileSourceKey',
      'tileSize',
      'minZoom',
      'maxZoom',
      'maxTiles',
      'resolution',
      'resourceMask',
      'useDevicePixelRatio',
    ] as const;
    if (keys.some((key) => next[key] !== this.config[key])) {
      this.dirty = true;
      this.images = [];
      this.replaceImages([]);
      this.loadedFallback = undefined;
      this.windowRect = undefined;
      this.display.width = next.imageWidth;
      this.display.height = next.imageHeight;
      this.points.set([1, 0, 0, next.imageWidth, next.imageHeight]);
      this.display.points.set(this.points);
    }
    this.config = next;
    for (const image of this.allImages) (image as WarpedMapImage).style.opacity = next.opacity ?? 1;
    this.__revision++;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    if (scale && scale > 0 && target[3] - target[1] > 1 && target[4] - target[2] > 1) {
      const x = Math.max(0, target[1] - this.x),
        y = Math.max(0, target[2] - this.y);
      const right = Math.min(this.config.imageWidth, target[3] - this.x);
      const bottom = Math.min(this.config.imageHeight, target[4] - this.y);
      if (right > x && bottom > y) {
        this.target = { x, y, width: right - x, height: bottom - y };
        this.viewportScale =
          scale * (this.config.useDevicePixelRatio && typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
        const w = this.windowRect;
        if (
          !w ||
          x < w.x ||
          y < w.y ||
          right > w.x + w.width ||
          bottom > w.y + w.height ||
          this.viewportScale > this.builtScale * 1.5 ||
          this.viewportScale < this.builtScale / 1.5
        )
          this.dirty = true;
      }
    }
    const current = this.images[0];
    if (!current) return [];
    if (!this.dirty && target[3] - target[1] > 1 && target[4] - target[2] > 1 && this.isImageLoaded(current, target)) {
      this.loadedFallback = current;
    }
    const selected =
      this.loadedFallback && this.loadedFallback !== current ? [this.loadedFallback, current] : [current];
    this.replaceImages(selected);
    const transform = aggregate ? compose(aggregate, translate(this.x, this.y)) : translate(this.x, this.y);
    return selected.flatMap((image) => image.getAllPointsAt(target, transform, scale));
  }

  isImageActive(image: SpacialContent): boolean {
    return image === this.images[0];
  }

  getScheduledUpdates(target: Strand, scale: number): Array<() => Promise<void>> {
    if (this.dirty && this.target) return [this.refresh];
    return super.getScheduledUpdates(target, scale);
  }

  private refresh = async () => {
    if (!this.target) return;
    this.dirty = false;
    const props = this.config;
    const t = this.target;
    // Retain half a viewport on each side so small pans reuse the mesh and loaded tiles.
    let x = Math.max(0, t.x - t.width / 2),
      y = Math.max(0, t.y - t.height / 2);
    let right = Math.min(props.imageWidth, t.x + t.width * 1.5);
    let bottom = Math.min(props.imageHeight, t.y + t.height * 1.5);
    if (props.resourceMask) {
      x = Math.max(x, Math.min(...props.resourceMask.map((p) => p[0])));
      y = Math.max(y, Math.min(...props.resourceMask.map((p) => p[1])));
      right = Math.min(right, Math.max(...props.resourceMask.map((p) => p[0])));
      bottom = Math.min(bottom, Math.max(...props.resourceMask.map((p) => p[1])));
    }
    // Track the unclipped window too: panning over the image border outside a mask must not rebuild every frame.
    this.windowRect = {
      x: Math.max(0, t.x - t.width / 2),
      y: Math.max(0, t.y - t.height / 2),
      width: Math.min(props.imageWidth, t.x + t.width * 1.5) - Math.max(0, t.x - t.width / 2),
      height: Math.min(props.imageHeight, t.y + t.height * 1.5) - Math.max(0, t.y - t.height / 2),
    };
    this.builtScale = this.viewportScale;
    try {
      let tiles: WarpedMapMeshTile[] = [];
      if (right > x && bottom > y) {
        const sample = sampleForwardMapMesh(
          props.transformer,
          { x, y, width: right - x, height: bottom - y },
          props.resolution
        );
        if (!sample.triangles.length) throw new Error('The visible image has no valid, nondegenerate map coordinates');
        const size = props.tileSize ?? 256;
        const min = props.minZoom ?? 0;
        this.zoom = Math.max(
          min,
          Math.min(props.maxZoom ?? 19, Math.ceil(Math.log2(this.viewportScale / (sample.unitsPerPixel * size))))
        );
        const mask = props.resourceMask || [
          [0, 0],
          [props.imageWidth, 0],
          [props.imageWidth, props.imageHeight],
          [0, props.imageHeight],
        ];
        for (;;) {
          try {
            tiles = tileForwardMapMesh(sample, this.zoom, size, props.maxTiles ?? 256, mask);
            break;
          } catch (error) {
            if (!(error instanceof MapMeshBudgetError) || this.zoom <= min) throw error;
            this.zoom--;
          }
        }
      }
      const urls = tiles.map(({ x, y, z }) =>
        resolveTileUrl(props.tileSource, { x, y, z, tileSize: props.tileSize ?? 256 })
      );
      // Keep the last complete window during rapid zooms; an unfinished replacement must not displace it.
      this.loadedFallback = this.loadedFallback || this.images[0];
      const current = tiles.length
        ? new WarpedMapImage(`${props.id}-${++this.generation}`, tiles, urls, props.tileSize ?? 256, props)
        : undefined;
      if (current) {
        current.__parent = this;
        current.__owner = this.__owner;
      }
      this.images = current ? [current] : [];
      this.replaceImages([...(this.loadedFallback ? [this.loadedFallback] : []), ...this.images]);
      this._scheduleSortByScales = false;
      this.__revision++;
    } catch (error) {
      this.images = [];
      this.replaceImages([]);
      this.loadedFallback = undefined;
      this.__revision++;
      const reason = error instanceof Error ? error : new Error(String(error));
      if (props.onError) props.onError(reason);
      else console.error('[WarpedMapLayer]', reason);
    }
  };
}
