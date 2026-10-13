import { latitudeToMercatorY, longitudeToMercatorX, mercatorXToLongitude, mercatorYToLatitude } from '../projection';
import type { WarpControlPoint, WarpTransformationType, WarpTransformer } from './types';

/**
 * Georeferencing transformations, fitted from ground control points.
 *
 * The maths is done in Web Mercator space (like Allmaps does by default) so that warped images
 * line up with the tile layer they are drawn on top of. The results are compatible with
 * `@allmaps/transform`; the test suite cross-checks them against it.
 */

type Vec2 = [number, number];

const MERCATOR_SCALE = 1; // normalised Web Mercator [0, 1]; conditioning is handled by normalisation below.

export class WarpTransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarpTransformError';
  }
}

/** Number of control points each transformation needs at minimum. */
export const WARP_MINIMUM_CONTROL_POINTS: Record<WarpTransformationType, number> = {
  straight: 2,
  helmert: 2,
  affine: 3,
  polynomial1: 3,
  polynomial2: 6,
  polynomial3: 10,
  projective: 4,
  thinPlateSpline: 3,
};

type Mapping = (x: number, y: number) => Vec2;

function solveLinearSystem(matrix: number[][], rhs: number[][]): number[][] {
  // Gaussian elimination with partial pivoting; supports multiple right hand sides.
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...rhs[i]]);
  const columns = a[0].length;

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new WarpTransformError(
        'Control points are degenerate (e.g. duplicated or collinear points); the transformation can not be solved'
      );
    }
    if (pivot !== col) {
      const tmp = a[pivot];
      a[pivot] = a[col];
      a[col] = tmp;
    }
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / a[col][col];
      if (factor === 0) continue;
      for (let k = col; k < columns; k++) {
        a[row][k] -= factor * a[col][k];
      }
    }
  }

  const result: number[][] = Array.from({ length: n }, () => new Array(columns - n).fill(0));
  for (let row = n - 1; row >= 0; row--) {
    for (let k = 0; k < columns - n; k++) {
      let sum = a[row][n + k];
      for (let col = row + 1; col < n; col++) {
        sum -= a[row][col] * result[col][k];
      }
      result[row][k] = sum / a[row][row];
    }
  }
  return result;
}

/** Least squares: minimise |A x - b| for several right hand sides via the normal equations. */
function leastSquares(design: number[][], targets: number[][]): number[][] {
  const columns = design[0].length;
  const ata: number[][] = Array.from({ length: columns }, () => new Array(columns).fill(0));
  const atb: number[][] = Array.from({ length: columns }, () => new Array(targets[0].length).fill(0));
  for (let r = 0; r < design.length; r++) {
    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < columns; j++) {
        ata[i][j] += design[r][i] * design[r][j];
      }
      for (let k = 0; k < targets[r].length; k++) {
        atb[i][k] += design[r][i] * targets[r][k];
      }
    }
  }
  return solveLinearSystem(ata, atb);
}

type Normalisation = {
  cx: number;
  cy: number;
  scale: number;
};

function normalisation(points: Vec2[]): Normalisation {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  let mean = 0;
  for (const [x, y] of points) {
    mean += Math.hypot(x - cx, y - cy);
  }
  mean /= points.length;
  return { cx, cy, scale: mean > 0 ? mean : 1 };
}

function polynomialTerms(degree: number): Array<[number, number]> {
  const terms: Array<[number, number]> = [];
  for (let total = 0; total <= degree; total++) {
    for (let px = total; px >= 0; px--) {
      terms.push([px, total - px]);
    }
  }
  return terms;
}

function fitPolynomial(source: Vec2[], target: Vec2[], degree: number): Mapping {
  const terms = polynomialTerms(degree);
  if (source.length < terms.length) {
    throw new WarpTransformError(`polynomial${degree} needs at least ${terms.length} control points`);
  }
  const sn = normalisation(source);
  const tn = normalisation(target);
  const design = source.map(([x, y]) => {
    const nx = (x - sn.cx) / sn.scale;
    const ny = (y - sn.cy) / sn.scale;
    return terms.map(([px, py]) => Math.pow(nx, px) * Math.pow(ny, py));
  });
  const targets = target.map(([x, y]) => [(x - tn.cx) / tn.scale, (y - tn.cy) / tn.scale]);
  const coefficients = leastSquares(design, targets);

  return (x, y) => {
    const nx = (x - sn.cx) / sn.scale;
    const ny = (y - sn.cy) / sn.scale;
    let ox = 0;
    let oy = 0;
    for (let i = 0; i < terms.length; i++) {
      const term = Math.pow(nx, terms[i][0]) * Math.pow(ny, terms[i][1]);
      ox += coefficients[i][0] * term;
      oy += coefficients[i][1] * term;
    }
    return [ox * tn.scale + tn.cx, oy * tn.scale + tn.cy];
  };
}

/** Similarity transform (rotation + uniform scale + translation); `rotation: false` is "straight". */
function fitSimilarity(source: Vec2[], target: Vec2[], rotation: boolean): Mapping {
  const n = source.length;
  let sx = 0;
  let sy = 0;
  let tx = 0;
  let ty = 0;
  for (let i = 0; i < n; i++) {
    sx += source[i][0];
    sy += source[i][1];
    tx += target[i][0];
    ty += target[i][1];
  }
  sx /= n;
  sy /= n;
  tx /= n;
  ty /= n;

  let numerator = 0;
  let denominator = 0;
  let a = 0; // scale * cos
  let b = 0; // scale * sin
  for (let i = 0; i < n; i++) {
    const px = source[i][0] - sx;
    const py = source[i][1] - sy;
    const qx = target[i][0] - tx;
    const qy = target[i][1] - ty;
    a += px * qx + py * qy;
    b += px * qy - py * qx;
    numerator += px * qx + py * qy;
    denominator += px * px + py * py;
  }
  if (denominator < 1e-12) {
    throw new WarpTransformError('Control points are degenerate; the transformation can not be solved');
  }

  if (!rotation) {
    const scale = numerator / denominator;
    return (x, y) => [(x - sx) * scale + tx, (y - sy) * scale + ty];
  }

  a /= denominator;
  b /= denominator;
  return (x, y) => {
    const px = x - sx;
    const py = y - sy;
    return [a * px - b * py + tx, b * px + a * py + ty];
  };
}

function fitProjective(source: Vec2[], target: Vec2[]): Mapping {
  const sn = normalisation(source);
  const tn = normalisation(target);
  const design: number[][] = [];
  const rhs: number[][] = [];
  for (let i = 0; i < source.length; i++) {
    const x = (source[i][0] - sn.cx) / sn.scale;
    const y = (source[i][1] - sn.cy) / sn.scale;
    const u = (target[i][0] - tn.cx) / tn.scale;
    const v = (target[i][1] - tn.cy) / tn.scale;
    design.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    rhs.push([u]);
    design.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    rhs.push([v]);
  }
  const h = leastSquares(design, rhs).map((row) => row[0]);

  return (px, py) => {
    const x = (px - sn.cx) / sn.scale;
    const y = (py - sn.cy) / sn.scale;
    const w = h[6] * x + h[7] * y + 1;
    const u = (h[0] * x + h[1] * y + h[2]) / w;
    const v = (h[3] * x + h[4] * y + h[5]) / w;
    return [u * tn.scale + tn.cx, v * tn.scale + tn.cy];
  };
}

function thinPlateKernel(r2: number): number {
  // U(r) = r^2 ln(r) = 0.5 * r^2 * ln(r^2)
  return r2 === 0 ? 0 : 0.5 * r2 * Math.log(r2);
}

function fitThinPlateSpline(source: Vec2[], target: Vec2[]): Mapping {
  const n = source.length;
  const sn = normalisation(source);
  const tn = normalisation(target);
  const src = source.map(([x, y]) => [(x - sn.cx) / sn.scale, (y - sn.cy) / sn.scale] as Vec2);

  const size = n + 3;
  const matrix: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = src[i][0] - src[j][0];
      const dy = src[i][1] - src[j][1];
      matrix[i][j] = thinPlateKernel(dx * dx + dy * dy);
    }
    matrix[i][n] = 1;
    matrix[i][n + 1] = src[i][0];
    matrix[i][n + 2] = src[i][1];
    matrix[n][i] = 1;
    matrix[n + 1][i] = src[i][0];
    matrix[n + 2][i] = src[i][1];
  }
  const rhs: number[][] = Array.from({ length: size }, () => [0, 0]);
  for (let i = 0; i < n; i++) {
    rhs[i] = [(target[i][0] - tn.cx) / tn.scale, (target[i][1] - tn.cy) / tn.scale];
  }
  const solution = solveLinearSystem(matrix, rhs);

  return (px, py) => {
    const x = (px - sn.cx) / sn.scale;
    const y = (py - sn.cy) / sn.scale;
    let ox = solution[n][0] + solution[n + 1][0] * x + solution[n + 2][0] * y;
    let oy = solution[n][1] + solution[n + 1][1] * x + solution[n + 2][1] * y;
    for (let i = 0; i < n; i++) {
      const dx = x - src[i][0];
      const dy = y - src[i][1];
      const k = thinPlateKernel(dx * dx + dy * dy);
      ox += solution[i][0] * k;
      oy += solution[i][1] * k;
    }
    return [ox * tn.scale + tn.cx, oy * tn.scale + tn.cy];
  };
}

function fit(type: WarpTransformationType, source: Vec2[], target: Vec2[]): Mapping {
  const minimum = WARP_MINIMUM_CONTROL_POINTS[type];
  if (minimum === undefined) {
    throw new WarpTransformError(`Unsupported transformation type: ${type}`);
  }
  if (source.length < minimum) {
    throw new WarpTransformError(`${type} needs at least ${minimum} control points, got ${source.length}`);
  }
  switch (type) {
    case 'straight':
      return fitSimilarity(source, target, false);
    case 'helmert':
      return fitSimilarity(source, target, true);
    case 'affine':
    case 'polynomial1':
      return fitPolynomial(source, target, 1);
    case 'polynomial2':
      return fitPolynomial(source, target, 2);
    case 'polynomial3':
      return fitPolynomial(source, target, 3);
    case 'projective':
      return fitProjective(source, target);
    case 'thinPlateSpline':
      return fitThinPlateSpline(source, target);
  }
}

/** Transformation types that are exactly an affine map, so a mesh does not need subdividing. */
export function isAffineWarpType(type: WarpTransformationType): boolean {
  return type === 'straight' || type === 'helmert' || type === 'affine' || type === 'polynomial1';
}

function toMercator(lng: number, lat: number): Vec2 {
  return [longitudeToMercatorX(lng) * MERCATOR_SCALE, latitudeToMercatorY(lat) * MERCATOR_SCALE];
}

function fromMercator(x: number, y: number): Vec2 {
  return [mercatorXToLongitude(x / MERCATOR_SCALE), mercatorYToLatitude(y / MERCATOR_SCALE)];
}

/**
 * Fits a transformation from image pixel coordinates to lng/lat using the given control points.
 *
 * The inverse (lng/lat to image pixels) is fitted lazily from the same control points.
 */
export function createWarpTransformer(
  controlPoints: WarpControlPoint[],
  type: WarpTransformationType = 'affine'
): WarpTransformer {
  const source: Vec2[] = controlPoints.map((point) => [point.image.x, point.image.y]);
  const target: Vec2[] = controlPoints.map((point) => toMercator(point.map.lng, point.map.lat));

  const forward = fit(type, source, target);
  let backward: Mapping | undefined;

  return {
    type,
    toGeo(x: number, y: number) {
      const [mx, my] = forward(x, y);
      return fromMercator(mx, my);
    },
    toResource(lng: number, lat: number) {
      if (!backward) {
        backward = fit(type, target, source);
      }
      const [mx, my] = toMercator(lng, lat);
      return backward(mx, my);
    },
  };
}

/**
 * Adapts an `@allmaps/transform` (or `@allmaps/project`) `GcpTransformer`, so Allmaps' additional
 * transformation types and projections can be used without Atlas depending on the package.
 *
 * ```ts
 * import { GcpTransformer } from '@allmaps/transform';
 * const transformer = fromAllmapsTransformer(new GcpTransformer(gcps, 'polynomial2'));
 * ```
 */
export function fromAllmapsTransformer(transformer: {
  transformToGeo(point: [number, number]): [number, number];
  transformToResource?(point: [number, number]): [number, number];
}): WarpTransformer {
  return {
    type: 'custom',
    toGeo(x, y) {
      const [lng, lat] = transformer.transformToGeo([x, y]);
      return [lng, lat];
    },
    toResource: transformer.transformToResource
      ? (lng, lat) => {
          const [x, y] = (transformer.transformToResource as (point: [number, number]) => [number, number])([lng, lat]);
          return [x, y];
        }
      : undefined,
  };
}
