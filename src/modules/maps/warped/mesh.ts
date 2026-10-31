import type { WarpTransformationType, WarpTransformer } from './types';
import { isAffineWarpType } from './transformer';

/** One source tile of a warped image. Coordinates are pixels of the full resolution image. */
export type WarpSourceTile = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Decoded pixel size of this tile's image (defaults to the tile size in image pixels). */
  pixelWidth?: number;
  pixelHeight?: number;
};

export type WarpMeshTile = {
  /** Optional clip in destination coordinates, relative to bounds (used by map overlays). */
  destinationMask?: Float32Array;
  /** Clipping polygon in this tile's decoded pixel coordinates, before warping. */
  resourceMask?: Float32Array;
  /** Triangle vertices in tile image pixels: u0, v0, u1, v1, ... */
  src: Float32Array;
  /** The same vertices in map-frame units, relative to `bounds.x1 / y1`. */
  dst: Float32Array;
  indices: Uint32Array;
  /** Where this tile lands in the map frame. */
  bounds: { x1: number; y1: number; x2: number; y2: number };
  /**
   * When the tile maps affinely (u, v) => (a u + c v + e, b u + d v + f), relative to `bounds`, a
   * single transformed draw can be used instead of triangles.
   */
  affine?: [number, number, number, number, number, number];
  /** Square root of (mapped area / source pixel area). Used to estimate the display scale. */
  unitsPerPixel: number;
};

export type WarpMeshOptions = {
  /** Single polygon in full-resolution image pixels; an omitted mask renders the full image. */
  resourceMask?: ReadonlyArray<readonly [number, number]>;
  tiles: WarpSourceTile[];
  /** Full resolution image size (the size the control points refer to). */
  imageWidth: number;
  imageHeight: number;
  transformer: WarpTransformer;
  /** Image pixels (lng/lat -> map frame) projection of the owning MapObject. */
  lngLatToWorld: (lng: number, lat: number) => { x: number; y: number };
  type?: WarpTransformationType | 'custom';
  /**
   * Target number of mesh cells along the longest side of the image. Smooth, non-affine
   * transformations need more. Defaults to 1 for affine types, 12 for projective and 24 otherwise.
   */
  resolution?: number;
  maxCellsPerTile?: number;
};

export function validateResourceMask(mask: WarpMeshOptions['resourceMask']): void {
  if (mask === undefined) return;
  if (mask.length < 3 || mask.some((p) => p.length !== 2 || !p.every(Number.isFinite))) {
    throw new Error('Resource mask must contain at least three finite image coordinate pairs');
  }
  let area = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i],
      b = mask[(i + 1) % mask.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 1e-8) throw new Error('Resource mask must have nonzero area');
}

export function defaultWarpResolution(type: WarpTransformationType | 'custom' | undefined): number {
  if (type && type !== 'custom' && isAffineWarpType(type)) {
    return 1;
  }
  if (type === 'projective') {
    return 12;
  }
  return 24;
}

type MeshVertexResult = { x: number; y: number } | null;

function triangleArea(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}

/**
 * Builds a textured triangle mesh for every tile, mapping image pixels to the map frame through the
 * transformer. Triangles with non-finite vertices (e.g. past the horizon of a projective map) are
 * dropped.
 */
export function buildWarpMesh(options: WarpMeshOptions): WarpMeshTile[] {
  const { tiles, transformer, imageWidth, imageHeight } = options;
  const mask = options.resourceMask;
  validateResourceMask(mask);
  const maskBounds = mask && {
    x1: Math.min(...mask.map((p) => p[0])),
    y1: Math.min(...mask.map((p) => p[1])),
    x2: Math.max(...mask.map((p) => p[0])),
    y2: Math.max(...mask.map((p) => p[1])),
  };
  const type = options.type ?? transformer.type;
  const resolution = Math.max(1, Math.round(options.resolution ?? defaultWarpResolution(type)));
  const maxCells = options.maxCellsPerTile ?? 48;
  const exactAffine = type !== 'custom' && type !== undefined && isAffineWarpType(type);
  const edge = Math.max(imageWidth, imageHeight) / resolution;

  const project = (x: number, y: number): MeshVertexResult => {
    const [lng, lat] = transformer.toGeo(x, y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return null;
    }
    const world = options.lngLatToWorld(lng, lat);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) {
      return null;
    }
    return world;
  };

  return tiles.map((tile): WarpMeshTile => {
    const width = tile.x2 - tile.x1;
    const height = tile.y2 - tile.y1;
    const pixelWidth = tile.pixelWidth ?? width;
    const pixelHeight = tile.pixelHeight ?? height;

    const columns = exactAffine ? 1 : Math.min(maxCells, Math.max(1, Math.ceil(width / edge)));
    const rows = exactAffine ? 1 : Math.min(maxCells, Math.max(1, Math.ceil(height / edge)));

    const vertexColumns = columns + 1;
    const vertexRows = rows + 1;
    const worldX = new Float64Array(vertexColumns * vertexRows);
    const worldY = new Float64Array(vertexColumns * vertexRows);
    const valid = new Uint8Array(vertexColumns * vertexRows);

    for (let row = 0; row < vertexRows; row++) {
      for (let column = 0; column < vertexColumns; column++) {
        const index = row * vertexColumns + column;
        const world = project(tile.x1 + (width * column) / columns, tile.y1 + (height * row) / rows);
        if (world) {
          worldX[index] = world.x;
          worldY[index] = world.y;
          valid[index] = 1;
        }
      }
    }

    // Bounds over valid vertices.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < valid.length; i++) {
      if (!valid[i]) continue;
      minX = Math.min(minX, worldX[i]);
      minY = Math.min(minY, worldY[i]);
      maxX = Math.max(maxX, worldX[i]);
      maxY = Math.max(maxY, worldY[i]);
    }
    if (!Number.isFinite(minX)) {
      return {
        src: new Float32Array(0),
        dst: new Float32Array(0),
        indices: new Uint32Array(0),
        bounds: { x1: 0, y1: 0, x2: 0, y2: 0 },
        unitsPerPixel: 0,
      };
    }

    const src = new Float32Array(vertexColumns * vertexRows * 2);
    const dst = new Float32Array(vertexColumns * vertexRows * 2);
    for (let row = 0; row < vertexRows; row++) {
      for (let column = 0; column < vertexColumns; column++) {
        const index = row * vertexColumns + column;
        src[index * 2] = (pixelWidth * column) / columns;
        src[index * 2 + 1] = (pixelHeight * row) / rows;
        dst[index * 2] = worldX[index] - minX;
        dst[index * 2 + 1] = worldY[index] - minY;
      }
    }

    const indices: number[] = [];
    let mappedArea = 0;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * vertexColumns + column;
        const b = a + 1;
        const c = a + vertexColumns;
        const d = c + 1;
        if (valid[a] && valid[b] && valid[c]) {
          indices.push(a, b, c);
          mappedArea += triangleArea(worldX[a], worldY[a], worldX[b], worldY[b], worldX[c], worldY[c]);
        }
        if (valid[b] && valid[d] && valid[c]) {
          indices.push(b, d, c);
          mappedArea += triangleArea(worldX[b], worldY[b], worldX[d], worldY[d], worldX[c], worldY[c]);
        }
      }
    }

    const result: WarpMeshTile = {
      src,
      dst,
      indices: Uint32Array.from(indices),
      bounds: { x1: minX, y1: minY, x2: maxX, y2: maxY },
      unitsPerPixel: Math.sqrt(mappedArea / Math.max(1, width * height)),
    };

    if (mask && maskBounds) {
      // Clip in texture space so the very same piecewise-affine warp bends both image and mask.
      result.resourceMask = Float32Array.from(
        mask.flatMap(([x, y]) => [((x - tile.x1) / width) * pixelWidth, ((y - tile.y1) / height) * pixelHeight])
      );
      if (
        tile.x2 <= maskBounds.x1 ||
        tile.x1 >= maskBounds.x2 ||
        tile.y2 <= maskBounds.y1 ||
        tile.y1 >= maskBounds.y2
      ) {
        result.indices = new Uint32Array(0);
      }
    }

    if (exactAffine && columns === 1 && rows === 1 && valid[0] && valid[1] && valid[2]) {
      // vertices: 0 = (0,0), 1 = (pw,0), 2 = (0,ph)
      const a = (dst[2] - dst[0]) / pixelWidth;
      const b = (dst[3] - dst[1]) / pixelWidth;
      const c = (dst[4] - dst[0]) / pixelHeight;
      const d = (dst[5] - dst[1]) / pixelHeight;
      result.affine = [a, b, c, d, dst[0], dst[1]];
    }

    return result;
  });
}

/** Area-weighted world units per full-resolution image pixel, over all tiles. */
export function meshUnitsPerImagePixel(mesh: WarpMeshTile[], tiles: WarpSourceTile[]): number {
  let area = 0;
  let pixels = 0;
  mesh.forEach((tile, index) => {
    const source = tiles[index];
    const tilePixels = Math.max(1, (source.x2 - source.x1) * (source.y2 - source.y1));
    area += tile.unitsPerPixel * tile.unitsPerPixel * tilePixels;
    pixels += tilePixels;
  });
  return pixels ? Math.sqrt(area / pixels) : 0;
}
