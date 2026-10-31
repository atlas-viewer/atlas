import { latitudeToMercatorY, longitudeToMercatorX, MAX_MERCATOR_LATITUDE } from '../projection';
import type { WorldRect } from '../types';
import { defaultWarpResolution, type WarpMeshTile } from './mesh';
import type { WarpTransformer } from './types';

/** Image coordinates and the corresponding normalized Web Mercator texture coordinates. */
type Vertex = { x: number; y: number; u: number; v: number };
type Triangle = [Vertex, Vertex, Vertex];

export type ForwardMapMesh = {
  triangles: Triangle[];
  /** Smallest sampled Mercator distance per image pixel, for choosing a tile zoom. */
  unitsPerPixel: number;
};

/** Sample in the destination image, using only the original forward transformation. */
export function sampleForwardMapMesh(
  transformer: WarpTransformer,
  rect: WorldRect,
  resolution = defaultWarpResolution(transformer.type)
): ForwardMapMesh {
  if (!Number.isInteger(resolution) || resolution < 1 || resolution > 256) {
    throw new Error('Warp resolution must be an integer between 1 and 256');
  }
  const edge = Math.max(rect.width, rect.height) / resolution;
  const columns = Math.max(1, Math.ceil(rect.width / edge));
  const rows = Math.max(1, Math.ceil(rect.height / edge));
  const vertices: Array<Vertex | null> = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const x = rect.x + (rect.width * col) / columns;
      const y = rect.y + (rect.height * row) / rows;
      const [lng, lat] = transformer.toGeo(x, y);
      vertices.push(
        Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= MAX_MERCATOR_LATITUDE
          ? { x, y, u: longitudeToMercatorX(lng), v: latitudeToMercatorY(lat) }
          : null
      );
    }
  }

  const triangles: Triangle[] = [];
  let unitsPerPixel = Infinity;
  const add = (a: Vertex | null, b: Vertex | null, c: Vertex | null) => {
    if (!a || !b || !c) return;
    const dx1 = b.x - a.x,
      dy1 = b.y - a.y;
    const dx2 = c.x - a.x,
      dy2 = c.y - a.y;
    const det = dx1 * dy2 - dx2 * dy1;
    const du1 = b.u - a.u,
      dv1 = b.v - a.v;
    const du2 = c.u - a.u,
      dv2 = c.v - a.v;
    const j00 = (du1 * dy2 - du2 * dy1) / det;
    const j01 = (du2 * dx1 - du1 * dx2) / det;
    const j10 = (dv1 * dy2 - dv2 * dy1) / det;
    const j11 = (dv2 * dx1 - dv1 * dx2) / det;
    const trace = j00 * j00 + j01 * j01 + j10 * j10 + j11 * j11;
    const determinant = Math.abs(j00 * j11 - j01 * j10);
    const largest = Math.sqrt((trace + Math.sqrt(Math.max(0, trace * trace - 4 * determinant * determinant))) / 2);
    const smallest = determinant / largest;
    if (!(smallest > 0) || !Number.isFinite(smallest)) return;
    unitsPerPixel = Math.min(unitsPerPixel, smallest);
    triangles.push([a, b, c]);
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col;
      const b = a + 1,
        c = a + columns + 1,
        d = c + 1;
      add(vertices[a], vertices[b], vertices[c]);
      add(vertices[b], vertices[d], vertices[c]);
    }
  }
  return { triangles, unitsPerPixel };
}

/** Clip in texture space, carrying image coordinates along with every intersection. */
function clip(polygon: Vertex[], axis: 'u' | 'v', boundary: number, greater: boolean): Vertex[] {
  const output: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const insideA = greater ? a[axis] >= boundary : a[axis] <= boundary;
    const insideB = greater ? b[axis] >= boundary : b[axis] <= boundary;
    if (insideA) output.push(a);
    if (insideA !== insideB) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      output.push({
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
        u: a.u + t * (b.u - a.u),
        v: a.v + t * (b.v - a.v),
        [axis]: boundary,
      });
    }
  }
  return output;
}

export class MapMeshBudgetError extends Error {}

export type WarpedMapMeshTile = { x: number; y: number; z: number; mesh: WarpMeshTile };

/** Split the forward mesh at XYZ tile boundaries. No reverse fit or inverse is used. */
export function tileForwardMapMesh(
  sampled: ForwardMapMesh,
  zoom: number,
  tileSize: number,
  maxTiles: number,
  mask: ReadonlyArray<readonly [number, number]>
): WarpedMapMeshTile[] {
  const n = 2 ** zoom;
  const pieces = new Map<string, { x: number; y: number; vertices: Vertex[] }>();
  let visits = 0;
  for (const triangle of sampled.triangles) {
    const source = triangle.map((p) => ({ ...p, u: p.u * n, v: p.v * n }));
    const minX = Math.max(0, Math.floor(Math.min(...source.map((p) => p.u))));
    const minY = Math.max(0, Math.floor(Math.min(...source.map((p) => p.v))));
    const maxX = Math.min(n - 1, Math.ceil(Math.max(...source.map((p) => p.u))) - 1);
    const maxY = Math.min(n - 1, Math.ceil(Math.max(...source.map((p) => p.v))) - 1);
    // Bound work before enumerating tiles, including nearly singular / horizon-crossing triangles.
    visits += Math.max(0, maxX - minX + 1) * Math.max(0, maxY - minY + 1);
    if (visits > maxTiles * 16 + sampled.triangles.length * 8)
      throw new MapMeshBudgetError('Warp tile budget exceeded');
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let polygon = clip(source, 'u', x, true);
        polygon = clip(polygon, 'u', x + 1, false);
        polygon = clip(polygon, 'v', y, true);
        polygon = clip(polygon, 'v', y + 1, false);
        if (polygon.length < 3) continue;
        const key = `${x}/${y}`;
        let tile = pieces.get(key);
        for (let i = 1; i < polygon.length - 1; i++) {
          const a = polygon[0],
            b = polygon[i],
            c = polygon[i + 1];
          if (Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) < 1e-10) continue;
          if (!tile) {
            if (pieces.size >= maxTiles) throw new MapMeshBudgetError('Warp tile budget exceeded');
            tile = { x, y, vertices: [] };
            pieces.set(key, tile);
          }
          tile.vertices.push(a, b, c);
        }
      }
    }
  }
  return [...pieces.values()].map(({ x, y, vertices }) => {
    const bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    for (const p of vertices) {
      bounds.x1 = Math.min(bounds.x1, p.x);
      bounds.y1 = Math.min(bounds.y1, p.y);
      bounds.x2 = Math.max(bounds.x2, p.x);
      bounds.y2 = Math.max(bounds.y2, p.y);
    }
    return {
      x,
      y,
      z: zoom,
      mesh: {
        src: Float32Array.from(vertices.flatMap((p) => [(p.u - x) * tileSize, (p.v - y) * tileSize])),
        dst: Float32Array.from(vertices.flatMap((p) => [p.x - bounds.x1, p.y - bounds.y1])),
        indices: Uint32Array.from(vertices.map((_, i) => i)),
        bounds,
        destinationMask: Float32Array.from(mask.flatMap(([mx, my]) => [mx - bounds.x1, my - bounds.y1])),
        unitsPerPixel: 1 / (sampled.unitsPerPixel * n * tileSize),
      },
    };
  });
}
