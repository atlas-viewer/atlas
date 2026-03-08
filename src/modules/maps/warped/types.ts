export type WarpControlPoint = {
  image: {
    x: number;
    y: number;
  };
  map: {
    lng: number;
    lat: number;
  };
};

export type WarpTransformationType = 'affine' | 'projective' | 'thinPlateSpline';

export type WarpUpdateReason = 'gcps' | 'transformation' | 'manual';

export type WarpAdapterHooks = {
  onControlPointsChange?: (controlPoints: WarpControlPoint[]) => void;
  onTransformationTypeChange?: (type: WarpTransformationType) => void;
  onUpdate?: (reason: WarpUpdateReason) => void;
};

export type WarpAdapter = {
  setMapGcps(controlPoints: WarpControlPoint[]): void;
  setMapTransformationType(type: WarpTransformationType): void;
  update(reason?: WarpUpdateReason): void;
};
