import { useMemo } from 'react';
import type { MapGeoJSONFeature, MapGeoJSONFeatureCollection, MapGeoJSONGeometry, MapGeoJSONInput } from '../../maps/types';
import { useMapProjection } from './use-map-projection';

export type ProjectedMapGeoJSONShape = {
  kind: 'shape';
  open: boolean;
  points: Array<[number, number]>;
  key: string;
  feature?: MapGeoJSONFeature;
};

export type ProjectedMapGeoJSONPoint = {
  kind: 'point';
  x: number;
  y: number;
  key: string;
  feature?: MapGeoJSONFeature;
};

export type ProjectedMapGeoJSONItem = ProjectedMapGeoJSONShape | ProjectedMapGeoJSONPoint;

function projectGeometry(
  geometry: MapGeoJSONGeometry,
  projectRing: (ring: Array<[number, number]>) => Array<[number, number]>,
  lngLatToWorld: (lng: number, lat: number) => { x: number; y: number },
  keyPrefix: string,
  feature?: MapGeoJSONFeature
): ProjectedMapGeoJSONItem[] {
  switch (geometry.type) {
    case 'Point': {
      const point = lngLatToWorld(geometry.coordinates[0], geometry.coordinates[1]);
      return [{ kind: 'point', x: point.x, y: point.y, key: `${keyPrefix}-point`, feature }];
    }

    case 'MultiPoint': {
      return geometry.coordinates.map(([lng, lat], idx) => {
        const point = lngLatToWorld(lng, lat);
        return {
          kind: 'point' as const,
          x: point.x,
          y: point.y,
          key: `${keyPrefix}-point-${idx}`,
          feature,
        };
      });
    }

    case 'LineString': {
      return [
        {
          kind: 'shape',
          open: true,
          points: projectRing(geometry.coordinates),
          key: `${keyPrefix}-line`,
          feature,
        },
      ];
    }

    case 'MultiLineString': {
      return geometry.coordinates.map((line, idx) => ({
        kind: 'shape' as const,
        open: true,
        points: projectRing(line),
        key: `${keyPrefix}-line-${idx}`,
        feature,
      }));
    }

    case 'Polygon': {
      return geometry.coordinates.map((ring, idx) => ({
        kind: 'shape' as const,
        open: false,
        points: projectRing(ring),
        key: `${keyPrefix}-polygon-${idx}`,
        feature,
      }));
    }

    case 'MultiPolygon': {
      const items: ProjectedMapGeoJSONItem[] = [];
      for (let polygonIndex = 0; polygonIndex < geometry.coordinates.length; polygonIndex++) {
        const polygon = geometry.coordinates[polygonIndex];
        for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
          items.push({
            kind: 'shape',
            open: false,
            points: projectRing(polygon[ringIndex]),
            key: `${keyPrefix}-polygon-${polygonIndex}-${ringIndex}`,
            feature,
          });
        }
      }
      return items;
    }

    default:
      return [];
  }
}

export function projectMapGeoJSON(
  input: MapGeoJSONInput | null | undefined,
  projection: {
    projectRing: (ring: Array<[number, number]>) => Array<[number, number]>;
    lngLatToWorld: (lng: number, lat: number) => { x: number; y: number };
  }
): ProjectedMapGeoJSONItem[] {
  if (!input) {
    return [];
  }

  if (input.type === 'FeatureCollection') {
    const collection = input as MapGeoJSONFeatureCollection;
    const all: ProjectedMapGeoJSONItem[] = [];
    for (let i = 0; i < collection.features.length; i++) {
      const feature = collection.features[i];
      if (!feature.geometry) {
        continue;
      }
      all.push(
        ...projectGeometry(
          feature.geometry,
          projection.projectRing,
          projection.lngLatToWorld,
          `feature-${feature.id || i}`,
          feature
        )
      );
    }
    return all;
  }

  if (input.type === 'Feature') {
    const feature = input as MapGeoJSONFeature;
    if (!feature.geometry) {
      return [];
    }
    return projectGeometry(feature.geometry, projection.projectRing, projection.lngLatToWorld, `feature-${feature.id || 0}`, feature);
  }

  return projectGeometry(input as MapGeoJSONGeometry, projection.projectRing, projection.lngLatToWorld, 'geometry');
}

export type MapGeoJSONProjector = {
  project: (input: MapGeoJSONInput | null | undefined) => ProjectedMapGeoJSONItem[];
};

export function useMapGeoJSON(): MapGeoJSONProjector {
  const projection = useMapProjection();

  return useMemo(
    () => ({
      project: (input: MapGeoJSONInput | null | undefined) => projectMapGeoJSON(input, projection),
    }),
    [projection]
  );
}
