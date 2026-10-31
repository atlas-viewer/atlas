/* @refresh skip */
import React, { useEffect, useMemo, useRef } from 'react';
import type { supportedEventAttributes } from '../../../events';
import { createFittedMapProjection, validateMapBounds } from '../../maps/projection';
import type { MapBounds } from '../../maps/types';
import { MapProjectionContext } from '../hooks/use-map-projection';

type MapObjectEvents = Partial<Record<(typeof supportedEventAttributes)[number], (e: any) => void>>;

export type MapObjectProps = {
  id?: string;
  bounds: MapBounds;
  x?: number;
  y?: number;
  width: number;
  height: number;
  preserveAspectRatio?: boolean;
  scale?: number;
  rotation?: number;
  /**
   * Called when the map can not be rendered (e.g. invalid bounds or size). The map renders
   * nothing in that case instead of throwing out of React's render.
   */
  onError?: (error: Error) => void;
  children?: React.ReactNode;
} & MapObjectEvents;

import type { WorldObject } from '../../../world-objects/world-object';

export const MapObject: React.FC<MapObjectProps> = ({
  bounds: boundsProp,
  width,
  height,
  preserveAspectRatio = true,
  onError,
  children,
  ...worldObjectProps
}) => {
  // Callers commonly pass inline bounds objects; key everything on the values.
  const { west, south, east, north } = boundsProp;
  const bounds = useMemo<MapBounds>(() => ({ west, south, east, north }), [west, south, east, north]);

  const object = useRef<WorldObject | null>(null);
  const { fitted, error } = useMemo(() => {
    try {
      validateMapBounds(bounds);
      if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
        throw new Error('Map width and height must be finite and greater than 0');
      }
      return { fitted: createFittedMapProjection({ bounds, width, height, preserveAspectRatio }), error: null };
    } catch (e) {
      return { fitted: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, [bounds, width, height, preserveAspectRatio]);

  useEffect(() => {
    if (error) {
      if (onError) {
        onError(error);
      } else {
        console.error(`[MapObject] ${error.message}`);
      }
    }
  }, [error, onError]);

  const contextValue = useMemo(
    () =>
      fitted
        ? {
            bounds,
            width,
            height,
            scale: worldObjectProps.scale,
            object,
            mapRect: fitted.mapRect,
            projection: fitted.projection,
          }
        : null,
    [bounds, fitted, height, width, worldObjectProps.scale]
  );

  if (!contextValue) {
    return null;
  }

  return React.createElement(
    MapProjectionContext.Provider,
    { value: contextValue },
    React.createElement('world-object', { width, height, ...worldObjectProps, ref: object }, children)
  );
};
