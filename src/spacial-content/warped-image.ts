import { dna } from '../utility/precise-dna';
import {
  buildWarpMesh,
  meshUnitsPerImagePixel,
  type WarpMeshTile,
  type WarpSourceTile,
  type WarpMeshOptions,
} from '../modules/maps/warped/mesh';
import type { WarpTransformationType, WarpTransformer } from '../modules/maps/warped/types';
import { TiledImage } from './tiled-image';

export type WarpedImageTile = WarpSourceTile & {
  url: string;
};

export type WarpedImageProps = {
  resourceMask?: WarpMeshOptions['resourceMask'];
  id?: string;
  /** Tiles of one level of the image. A plain image is a single tile covering the whole image. */
  tiles: WarpedImageTile[];
  /** Full resolution image size; control points and tile coordinates refer to it. */
  imageWidth: number;
  imageHeight: number;
  /** Full resolution pixels per tile pixel at this level (1 for the full resolution level). */
  scaleFactor?: number;
  transformer: WarpTransformer;
  /** Projection from lng/lat into the frame that contains this image (usually a MapObject). */
  lngLatToWorld: (lng: number, lat: number) => { x: number; y: number };
  transformationType?: WarpTransformationType | 'custom';
  /** Mesh cells along the longest image side. See `defaultWarpResolution`. */
  resolution?: number;
  format?: string;
};

/**
 * An image (single or tiled) drawn through a georeferencing transformation, rather than as
 * axis-aligned rectangles.
 *
 * It is a `TiledImage` for everything that selects and loads tiles. The canvas renderer draws each
 * tile as a textured triangle mesh (see `getWarpTile`); the WebGL fast path ignores warped images
 * so they are drawn by the canvas renderer in the WebGL preset.
 */
export class WarpedImage extends TiledImage {
  readonly isWarped = true;
  readonly compositeOpacity = true;
  readonly sourceTiles: WarpedImageTile[];
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly levelScale: number;
  mesh: WarpMeshTile[];
  private meshResolution?: number;
  private meshType?: WarpTransformationType | 'custom';
  private currentTransformer: WarpTransformer;
  private currentProjection: WarpedImageProps['lngLatToWorld'];
  private resourceMask?: WarpedImageProps['resourceMask'];

  constructor(props: WarpedImageProps) {
    const levelScale = props.scaleFactor || 1;
    const mesh = buildWarpMesh({
      resourceMask: props.resourceMask,
      tiles: props.tiles,
      imageWidth: props.imageWidth,
      imageHeight: props.imageHeight,
      transformer: props.transformer,
      lngLatToWorld: props.lngLatToWorld,
      type: props.transformationType,
      resolution: props.resolution,
    });
    const unitsPerImagePixel = meshUnitsPerImagePixel(mesh, props.tiles) || 1;
    const scaleFactor = levelScale * unitsPerImagePixel;

    const pixelPoints: number[] = [];
    const worldPoints: number[] = [];
    props.tiles.forEach((tile, index) => {
      const w = tile.pixelWidth ?? tile.x2 - tile.x1;
      const h = tile.pixelHeight ?? tile.y2 - tile.y1;
      const x = tile.x1 / levelScale;
      const y = tile.y1 / levelScale;
      pixelPoints.push(1, x, y, x + w, y + h);
      const bounds = mesh[index].bounds;
      const visible = mesh[index].indices.length > 0;
      worldPoints.push(visible ? 1 : 0, bounds.x1, bounds.y1, bounds.x2, bounds.y2);
    });

    super({
      id: props.id || `warped-${props.tiles[0]?.url || 'image'}`,
      url: 'warped://image',
      scaleFactor,
      points: dna(pixelPoints.length ? pixelPoints : [0, 0, 0, 0, 0]),
      displayPoints: dna(worldPoints.length ? worldPoints : [0, 0, 0, 0, 0]),
      tileWidth: Math.max(1, ...props.tiles.map((tile) => tile.pixelWidth ?? tile.x2 - tile.x1)),
      tileHeight: Math.max(1, ...props.tiles.map((tile) => tile.pixelHeight ?? tile.y2 - tile.y1)),
      width: props.imageWidth * unitsPerImagePixel,
      height: props.imageHeight * unitsPerImagePixel,
      columns: props.tiles.length,
      rows: 1,
      format: props.format || 'jpg',
      version3: false,
    });

    this.sourceTiles = props.tiles;
    this.imageWidth = props.imageWidth;
    this.imageHeight = props.imageHeight;
    this.levelScale = levelScale;
    this.mesh = mesh;
    this.meshResolution = props.resolution;
    this.meshType = props.transformationType;
    this.currentTransformer = props.transformer;
    this.currentProjection = props.lngLatToWorld;
    this.resourceMask = props.resourceMask;
  }

  getImageUrl(index: number): string {
    return this.sourceTiles[index]?.url || '';
  }

  getWarpTile(index: number): WarpMeshTile | undefined {
    return this.mesh[index];
  }

  /**
   * Re-fit the mesh in place, e.g. after control points changed. Tile images stay loaded.
   */
  setTransform(config: {
    transformer: WarpTransformer;
    lngLatToWorld: (lng: number, lat: number) => { x: number; y: number };
    transformationType?: WarpTransformationType | 'custom';
    resolution?: number;
    resourceMask?: WarpedImageProps['resourceMask'];
  }) {
    if ('resourceMask' in config) this.resourceMask = config.resourceMask;
    if ('resolution' in config) this.meshResolution = config.resolution;
    this.meshType = config.transformationType ?? this.meshType;
    this.currentTransformer = config.transformer;
    this.currentProjection = config.lngLatToWorld;

    this.mesh = buildWarpMesh({
      resourceMask: this.resourceMask,
      tiles: this.sourceTiles,
      imageWidth: this.imageWidth,
      imageHeight: this.imageHeight,
      transformer: config.transformer,
      lngLatToWorld: config.lngLatToWorld,
      type: this.meshType,
      resolution: this.meshResolution,
    });

    this.mesh.forEach((tile, index) => {
      const n = index * 5;
      this.points[n] = tile.indices.length > 0 ? 1 : 0;
      this.points[n + 1] = tile.bounds.x1;
      this.points[n + 2] = tile.bounds.y1;
      this.points[n + 3] = tile.bounds.x2;
      this.points[n + 4] = tile.bounds.y2;
    });

    const units = meshUnitsPerImagePixel(this.mesh, this.sourceTiles) || 1;
    this.display.scale = this.levelScale * units;
    this.display.width = this.imageWidth / this.levelScale;
    this.display.height = this.imageHeight / this.levelScale;
    this.__parent?.sortByScales();
    this.__revision++;
  }

  applyProps(props: any) {
    super.applyProps(props);
    if (!props || !props.transformer || !props.lngLatToWorld) {
      return;
    }
    const resolutionChanged = props.resolution !== this.meshResolution;
    if (
      props.transformer !== this.currentTransformer ||
      props.lngLatToWorld !== this.currentProjection ||
      props.resourceMask !== this.resourceMask ||
      resolutionChanged ||
      props.transformationType !== this.meshType
    ) {
      this.setTransform({
        transformer: props.transformer,
        lngLatToWorld: props.lngLatToWorld,
        transformationType: props.transformationType,
        resolution: props.resolution,
        resourceMask: props.resourceMask,
      });
    }
  }
}

export function isWarpedImage(value: unknown): value is TiledImage & {
  compositeOpacity?: boolean;
  getWarpTile(index: number): WarpMeshTile | undefined;
} {
  return !!value && (value as WarpedImage).isWarped === true;
}
