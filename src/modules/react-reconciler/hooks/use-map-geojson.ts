import { useMemo } from 'react';
import type {
  MapGeoJSONFeature,
  MapGeoJSONFeatureCollection,
  MapGeoJSONGeometry,
  MapGeoJSONInput,
} from '../../maps/types';
import { useMapProjection } from './use-map-projection';

export type ProjectedMapGeoJSONShape = {
  kind: 'shape';
  /** Open shapes are lines; closed shapes are polygons. */
  open: boolean;
  points: Array<[number, number]>;
  /** Rings cut out of a polygon. Only present for polygons that have holes. */
  holes?: Array<Array<[number, number]>>;
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

type Projector = {
  projectRing: (ring: Array<[number, number]>) => Array<[number, number]>;
  lngLatToWorld: (lng: number, lat: number) => { x: number; y: number };
};

function projectPolygon(
  rings: Array<Array<[number, number]>>,
  projection: Projector,
  key: string,
  feature?: MapGeoJSONFeature
): ProjectedMapGeoJSONShape[] {
  if (!rings.length) {
    return [];
  }
  const [outer, ...holes] = rings;
  const shape: ProjectedMapGeoJSONShape = {
    kind: 'shape',
    open: false,
    points: projection.projectRing(outer),
    key,
    feature,
  };
  if (holes.length) {
    shape.holes = holes.map((hole) => projection.projectRing(hole));
  }
  return [shape];
}

function projectGeometry(
  geometry: MapGeoJSONGeometry,
  projection: Projector,
  keyPrefix: string,
  feature?: MapGeoJSONFeature
): ProjectedMapGeoJSONItem[] {
  switch (geometry.type) {
    case 'Point': {
      const point = projection.lngLatToWorld(geometry.coordinates[0], geometry.coordinates[1]);
      return [{ kind: 'point', x: point.x, y: point.y, key: `${keyPrefix}-point`, feature }];
    }

    case 'MultiPoint': {
      return geometry.coordinates.map(([lng, lat], idx) => {
        const point = projection.lngLatToWorld(lng, lat);
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
          points: projection.projectRing(geometry.coordinates),
          key: `${keyPrefix}-line`,
          feature,
        },
      ];
    }

    case 'MultiLineString': {
      return geometry.coordinates.map((line, idx) => ({
        kind: 'shape' as const,
        open: true,
        points: projection.projectRing(line),
        key: `${keyPrefix}-line-${idx}`,
        feature,
      }));
    }

    case 'Polygon': {
      return projectPolygon(geometry.coordinates, projection, `${keyPrefix}-polygon`, feature);
    }

    case 'MultiPolygon': {
      const items: ProjectedMapGeoJSONItem[] = [];
      for (let polygonIndex = 0; polygonIndex < geometry.coordinates.length; polygonIndex++) {
        items.push(
          ...projectPolygon(geometry.coordinates[polygonIndex], projection, `${keyPrefix}-polygon-${polygonIndex}`, feature)
        );
      }
      return items;
    }

    case 'GeometryCollection': {
      const items: ProjectedMapGeoJSONItem[] = [];
      for (let index = 0; index < geometry.geometries.length; index++) {
        items.push(...projectGeometry(geometry.geometries[index], projection, `${keyPrefix}-geometry-${index}`, feature));
      }
      return items;
    }

    default:
      return [];
  }
}

function uniqueKeys(items: ProjectedMapGeoJSONItem[]): ProjectedMapGeoJSONItem[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const count = seen.get(item.key) || 0;
    seen.set(item.key, count + 1);
    if (count > 0) {
      // Duplicate feature ids would otherwise collide as React keys / object ids.
      item.key = `${item.key}~${count}`;
    }
  }
  return items;
}

export function projectMapGeoJSON(input: MapGeoJSONInput | null | undefined, projection: Projector): ProjectedMapGeoJSONItem[] {
  if (!input) {
    return [];
  }

  if (input.type === 'FeatureCollection') {
    const collection = input as MapGeoJSONFeatureCollection;
    const all: ProjectedMapGeoJSONItem[] = [];
    for (let i = 0; i < collection.features.length; i++) {
      const feature = collection.features[i];
      if (!feature || !feature.geometry) {
        continue;
      }
      // `id` can legitimately be 0.
      const id = feature.id === undefined || feature.id === null ? i : feature.id;
      all.push(...projectGeometry(feature.geometry, projection, `feature-${id}`, feature));
    }
    return uniqueKeys(all);
  }

  if (input.type === 'Feature') {
    const feature = input as MapGeoJSONFeature;
    if (!feature.geometry) {
      return [];
    }
    const id = feature.id === undefined || feature.id === null ? 0 : feature.id;
    return uniqueKeys(projectGeometry(feature.geometry, projection, `feature-${id}`, feature));
  }

  return uniqueKeys(projectGeometry(input as MapGeoJSONGeometry, projection, 'geometry'));
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
