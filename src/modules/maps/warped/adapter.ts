import type { WarpAdapter, WarpAdapterHooks, WarpControlPoint, WarpTransformationType, WarpUpdateReason } from './types';

export class WarpAdapterController {
  private controlPoints: WarpControlPoint[] = [];
  private transformationType: WarpTransformationType = 'projective';

  constructor(
    private readonly adapter: WarpAdapter,
    private readonly hooks: WarpAdapterHooks = {}
  ) {}

  getState() {
    return {
      controlPoints: [...this.controlPoints],
      transformationType: this.transformationType,
    };
  }

  setControlPoints(controlPoints: WarpControlPoint[]): void {
    this.controlPoints = [...controlPoints];
    this.adapter.setMapGcps(this.controlPoints);
    if (this.hooks.onControlPointsChange) {
      this.hooks.onControlPointsChange(this.controlPoints);
    }
    this.update('gcps');
  }

  setTransformationType(type: WarpTransformationType): void {
    this.transformationType = type;
    this.adapter.setMapTransformationType(type);
    if (this.hooks.onTransformationTypeChange) {
      this.hooks.onTransformationTypeChange(type);
    }
    this.update('transformation');
  }

  update(reason: WarpUpdateReason = 'manual'): void {
    this.adapter.update(reason);
    if (this.hooks.onUpdate) {
      this.hooks.onUpdate(reason);
    }
  }
}

export function createWarpAdapterController(adapter: WarpAdapter, hooks?: WarpAdapterHooks): WarpAdapterController {
  return new WarpAdapterController(adapter, hooks);
}
