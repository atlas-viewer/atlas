/* @refresh skip */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateWarpedMapLayer, type WarpedMapResourceProps } from '../../../spacial-content/warped-map-layer';
import type { WarpAdapterController } from '../../maps/warped/adapter';
import { createWarpTransformer } from '../../maps/warped/transformer';
import type { WarpControlPoint, WarpTransformationType } from '../../maps/warped/types';
import type { MapTileUrlContext } from '../../maps/types';

export type WarpedMapLayerProps = Omit<WarpedMapResourceProps, 'id' | 'transformer'> & {
  id?: string;
  controlPoints?: WarpControlPoint[];
  transformationType?: WarpTransformationType;
  transformer?: WarpedMapResourceProps['transformer'];
  controller?: WarpAdapterController;
};

let nextId = 0;

/** Draw XYZ map tiles above an ordinary IIIF image, in its full-resolution pixel coordinates. */
export const WarpedMapLayer: React.FC<WarpedMapLayerProps> = ({
  controlPoints,
  transformationType = 'affine',
  transformer: supplied,
  controller,
  ...props
}) => {
  const id = useRef<string>();
  if (!id.current) id.current = `warped-map-${++nextId}`;
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!controller) return;
    setRevision((value) => value + 1);
    return controller.subscribe(() => setRevision((value) => value + 1));
  }, [controller]);

  // Keep inline function sources stable; tileSourceKey explicitly invalidates their tiles.
  const source = useRef(props.tileSource);
  source.current = props.tileSource;
  const functionSource = useCallback(
    (ctx: MapTileUrlContext) => (typeof source.current === 'function' ? source.current(ctx) : ''),
    []
  );
  const tileSource = typeof props.tileSource === 'function' ? functionSource : props.tileSource;
  const fit = useMemo(() => {
    try {
      const transformer =
        supplied ||
        (controller ? controller.getTransformer() : createWarpTransformer(controlPoints || [], transformationType));
      if (!transformer) throw controller?.getError() || new Error('No map transformation is available');
      return { transformer, error: null };
    } catch (error) {
      return { transformer: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [supplied, controller, controlPoints, transformationType, revision]);

  let error = fit.error;
  const resolved: WarpedMapResourceProps = {
    ...props,
    id: props.id || id.current,
    tileSource,
    transformer: fit.transformer!,
    resourceMask: props.resourceMask,
    resolution: props.resolution,
    tileSourceKey: props.tileSourceKey,
    minZoom: props.minZoom,
    maxZoom: props.maxZoom,
    tileSize: props.tileSize,
    maxTiles: props.maxTiles,
    opacity: props.opacity,
    useDevicePixelRatio: props.useDevicePixelRatio,
    onError: props.onError,
  };
  if (!error) {
    try {
      validateWarpedMapLayer(resolved);
    } catch (reason) {
      error = reason instanceof Error ? reason : new Error(String(reason));
    }
  }
  const message = error?.message;
  useEffect(() => {
    if (!message) return;
    if (props.onError) props.onError(new Error(message));
    else console.error('[WarpedMapLayer]', message);
  }, [message, props.onError]);

  return error ? null : React.createElement('warped-map-layer', resolved);
};
