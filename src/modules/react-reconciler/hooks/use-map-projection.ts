import { createContext, useContext } from 'react';
import type { MapBounds, MapProjection } from '../../maps/types';

export type MapProjectionContextValue = {
  bounds: MapBounds;
  width: number;
  height: number;
  mapRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  projection: MapProjection;
};

export const MapProjectionContext = createContext<MapProjectionContextValue | null>(null);
MapProjectionContext.displayName = 'MapProjection';

export function useMapProjectionContext(): MapProjectionContextValue {
  const context = useContext(MapProjectionContext);
  if (!context) {
    throw new Error('useMapProjection must be used within <MapObject />');
  }
  return context;
}

export function useMapProjection(): MapProjection {
  return useMapProjectionContext().projection;
}
