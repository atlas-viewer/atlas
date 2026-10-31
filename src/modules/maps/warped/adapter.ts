import { createWarpTransformer } from './transformer';
import type {
  WarpAdapter,
  WarpAdapterHooks,
  WarpControlPoint,
  WarpTransformationType,
  WarpTransformer,
  WarpUpdateReason,
} from './types';

export type WarpControllerState = {
  controlPoints: WarpControlPoint[];
  transformationType: WarpTransformationType;
};

/**
 * Owns the control points and transformation type for a warped image, and builds the
 * transformer from them.
 *
 * It can also forward every change to an external {@link WarpAdapter}, so the same state can drive
 * e.g. an Allmaps layer alongside Atlas.
 */
export class WarpAdapterController {
  private controlPoints: WarpControlPoint[] = [];
  private transformationType: WarpTransformationType = 'projective';
  private transformer: WarpTransformer | null = null;
  private transformerError: Error | null = null;
  private transformerDirty = true;
  private readonly listeners = new Set<(reason: WarpUpdateReason) => void>();

  constructor(
    private readonly adapter?: WarpAdapter,
    private readonly hooks: WarpAdapterHooks = {}
  ) {}

  getState(): WarpControllerState {
    return {
      controlPoints: [...this.controlPoints],
      transformationType: this.transformationType,
    };
  }

  /**
   * The current transformer, or `null` if the control points / type can not produce one yet
   * (see {@link getError}).
   */
  getTransformer(): WarpTransformer | null {
    if (this.transformerDirty) {
      this.transformerDirty = false;
      try {
        this.transformer = createWarpTransformer(this.controlPoints, this.transformationType);
        this.transformerError = null;
      } catch (error) {
        this.transformer = null;
        this.transformerError = error instanceof Error ? error : new Error(String(error));
      }
    }
    return this.transformer;
  }

  getError(): Error | null {
    this.getTransformer();
    return this.transformerError;
  }

  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(listener: (reason: WarpUpdateReason) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setControlPoints(controlPoints: WarpControlPoint[]): void {
    this.controlPoints = [...controlPoints];
    this.transformerDirty = true;
    this.adapter?.setMapGcps(this.controlPoints);
    if (this.hooks.onControlPointsChange) {
      this.hooks.onControlPointsChange(this.controlPoints);
    }
    this.update('gcps');
  }

  setTransformationType(type: WarpTransformationType): void {
    this.transformationType = type;
    this.transformerDirty = true;
    this.adapter?.setMapTransformationType(type);
    if (this.hooks.onTransformationTypeChange) {
      this.hooks.onTransformationTypeChange(type);
    }
    this.update('transformation');
  }

  update(reason: WarpUpdateReason = 'manual'): void {
    this.adapter?.update(reason);
    if (this.hooks.onUpdate) {
      this.hooks.onUpdate(reason);
    }
    for (const listener of this.listeners) {
      listener(reason);
    }
  }
}

export function createWarpAdapterController(adapter?: WarpAdapter, hooks?: WarpAdapterHooks): WarpAdapterController {
  return new WarpAdapterController(adapter, hooks);
}
