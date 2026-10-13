export type WarpControlPoint = {
  /** Position on the (full resolution) image, in pixels. */
  image: {
    x: number;
    y: number;
  };
  /** Position on the map. */
  map: {
    lng: number;
    lat: number;
  };
};

/**
 * - `straight`: translation + uniform scale (2+ points)
 * - `helmert`: translation + rotation + uniform scale (2+ points)
 * - `affine` / `polynomial1`: affine (3+ points)
 * - `polynomial2` / `polynomial3`: higher order polynomials (6+ / 10+ points)
 * - `projective`: perspective (4+ points)
 * - `thinPlateSpline`: exact through all points, smooth in between (3+ points)
 */
export type WarpTransformationType =
  | 'straight'
  | 'helmert'
  | 'affine'
  | 'polynomial1'
  | 'polynomial2'
  | 'polynomial3'
  | 'projective'
  | 'thinPlateSpline';

export type WarpUpdateReason = 'gcps' | 'transformation' | 'manual';

export type WarpAdapterHooks = {
  onControlPointsChange?: (controlPoints: WarpControlPoint[]) => void;
  onTransformationTypeChange?: (type: WarpTransformationType) => void;
  onUpdate?: (reason: WarpUpdateReason) => void;
};

/** Bridge to an external warping implementation (e.g. an Allmaps layer). */
export type WarpAdapter = {
  setMapGcps(controlPoints: WarpControlPoint[]): void;
  setMapTransformationType(type: WarpTransformationType): void;
  update(reason?: WarpUpdateReason): void;
};

/** Maps image pixel coordinates to lng/lat. */
export type WarpTransformer = {
  type: WarpTransformationType | 'custom';
  toGeo(x: number, y: number): [number, number];
  toResource?(lng: number, lat: number): [number, number];
};
