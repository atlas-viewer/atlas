import type { LngLatPoint, MapBounds, MapProjection, WorldPoint, WorldRect } from './types';

export const MAX_MERCATOR_LATITUDE = 85.05112878;

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertPositiveNumber(value: number, label: string): void {
  assertFiniteNumber(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }
}

export function clampMercatorLatitude(lat: number): number {
  if (!Number.isFinite(lat)) {
    throw new Error('Latitude must be a finite number');
  }
  if (lat > MAX_MERCATOR_LATITUDE) {
    return MAX_MERCATOR_LATITUDE;
  }
  if (lat < -MAX_MERCATOR_LATITUDE) {
    return -MAX_MERCATOR_LATITUDE;
  }
  return lat;
}

export function validateMapBounds(bounds: MapBounds): MapBounds {
  assertFiniteNumber(bounds.west, 'Map bounds west');
  assertFiniteNumber(bounds.south, 'Map bounds south');
  assertFiniteNumber(bounds.east, 'Map bounds east');
  assertFiniteNumber(bounds.north, 'Map bounds north');

  if (bounds.west < -180 || bounds.west > 180) {
    throw new Error('Map bounds west must be within [-180, 180]');
  }
  if (bounds.east < -180 || bounds.east > 180) {
    throw new Error('Map bounds east must be within [-180, 180]');
  }
  if (bounds.south < -90 || bounds.south > 90) {
    throw new Error('Map bounds south must be within [-90, 90]');
  }
  if (bounds.north < -90 || bounds.north > 90) {
    throw new Error('Map bounds north must be within [-90, 90]');
  }

  if (bounds.west >= bounds.east) {
    throw new Error('Map bounds must satisfy west < east (antimeridian crossing is not supported)');
  }

  if (bounds.south >= bounds.north) {
    throw new Error('Map bounds must satisfy south < north');
  }

  return bounds;
}

export function longitudeToMercatorX(lng: number): number {
  if (!Number.isFinite(lng)) {
    throw new Error('Longitude must be a finite number');
  }
  return (lng + 180) / 360;
}

export function latitudeToMercatorY(lat: number): number {
  const clamped = clampMercatorLatitude(lat);
  const radians = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

export function mercatorXToLongitude(x: number): number {
  if (!Number.isFinite(x)) {
    throw new Error('Mercator X must be a finite number');
  }
  return x * 360 - 180;
}

export function mercatorYToLatitude(y: number): number {
  if (!Number.isFinite(y)) {
    throw new Error('Mercator Y must be a finite number');
  }
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function lngToTileX(lng: number, zoom: number): number {
  return longitudeToMercatorX(lng) * Math.pow(2, zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  return latitudeToMercatorY(lat) * Math.pow(2, zoom);
}

export function tileXToLng(tileX: number, zoom: number): number {
  return mercatorXToLongitude(tileX / Math.pow(2, zoom));
}

export function tileYToLat(tileY: number, zoom: number): number {
  return mercatorYToLatitude(tileY / Math.pow(2, zoom));
}

export function createMapProjection(config: { bounds: MapBounds; width: number; height: number }): MapProjection {
  const bounds = validateMapBounds(config.bounds);
  assertPositiveNumber(config.width, 'Map world width');
  assertPositiveNumber(config.height, 'Map world height');

  const westX = longitudeToMercatorX(bounds.west);
  const eastX = longitudeToMercatorX(bounds.east);
  const northY = latitudeToMercatorY(bounds.north);
  const southY = latitudeToMercatorY(bounds.south);

  const widthMercator = eastX - westX;
  const heightMercator = southY - northY;

  if (!(widthMercator > 0)) {
    throw new Error('Map bounds produce an invalid mercator X span');
  }
  if (!(heightMercator > 0)) {
    throw new Error('Map bounds produce an invalid mercator Y span');
  }

  const lngLatToWorld = (lng: number, lat: number): WorldPoint => {
    const xNorm = longitudeToMercatorX(lng);
    const yNorm = latitudeToMercatorY(lat);
    return {
      x: ((xNorm - westX) / widthMercator) * config.width,
      y: ((yNorm - northY) / heightMercator) * config.height,
    };
  };

  const worldToLngLat = (x: number, y: number): LngLatPoint => {
    assertFiniteNumber(x, 'World x');
    assertFiniteNumber(y, 'World y');

    const xNorm = westX + (x / config.width) * widthMercator;
    const yNorm = northY + (y / config.height) * heightMercator;

    return {
      lng: mercatorXToLongitude(xNorm),
      lat: mercatorYToLatitude(yNorm),
    };
  };

  const lngLatBoundsToWorldRect = (boundsToProject: MapBounds): WorldRect => {
    validateMapBounds(boundsToProject);

    const northWest = lngLatToWorld(boundsToProject.west, boundsToProject.north);
    const southEast = lngLatToWorld(boundsToProject.east, boundsToProject.south);

    return {
      x: northWest.x,
      y: northWest.y,
      width: southEast.x - northWest.x,
      height: southEast.y - northWest.y,
    };
  };

  const worldRectToLngLatBounds = (rect: WorldRect): MapBounds => {
    assertFiniteNumber(rect.x, 'World rect x');
    assertFiniteNumber(rect.y, 'World rect y');
    assertFiniteNumber(rect.width, 'World rect width');
    assertFiniteNumber(rect.height, 'World rect height');

    const northWest = worldToLngLat(rect.x, rect.y);
    const southEast = worldToLngLat(rect.x + rect.width, rect.y + rect.height);

    return {
      west: northWest.lng,
      south: southEast.lat,
      east: southEast.lng,
      north: northWest.lat,
    };
  };

  const projectRing = (ring: Array<[number, number]>): Array<[number, number]> => {
    const projected: Array<[number, number]> = [];
    for (const [lng, lat] of ring) {
      const world = lngLatToWorld(lng, lat);
      projected.push([world.x, world.y]);
    }
    return projected;
  };

  return {
    lngLatToWorld,
    worldToLngLat,
    lngLatBoundsToWorldRect,
    worldRectToLngLatBounds,
    projectRing,
  };
}

/**
 * The rectangle (in a `width` x `height` frame) that the bounds occupy. With
 * `preserveAspectRatio` the bounds are letterboxed and centered; otherwise they fill the frame.
 */
export function fitMapBoundsToRect(config: {
  bounds: MapBounds;
  width: number;
  height: number;
  preserveAspectRatio?: boolean;
}): WorldRect {
  const { bounds, width, height } = config;
  if (config.preserveAspectRatio === false) {
    return { x: 0, y: 0, width, height };
  }

  const mercatorWidth = longitudeToMercatorX(bounds.east) - longitudeToMercatorX(bounds.west);
  const mercatorHeight = latitudeToMercatorY(bounds.south) - latitudeToMercatorY(bounds.north);
  const mapAspect = mercatorWidth / mercatorHeight;
  const frameAspect = width / height;

  if (!Number.isFinite(mapAspect) || mapAspect <= 0) {
    return { x: 0, y: 0, width, height };
  }

  if (frameAspect > mapAspect) {
    const fittedWidth = height * mapAspect;
    return { x: (width - fittedWidth) / 2, y: 0, width: fittedWidth, height };
  }

  const fittedHeight = width / mapAspect;
  return { x: 0, y: (height - fittedHeight) / 2, width, height: fittedHeight };
}

/**
 * A projection for bounds fitted into a frame, in the frame's coordinates. This is the projection
 * `<MapObject />` provides, so it can also be used outside of React (e.g. to move the viewport to
 * a place on the map).
 */
export function createFittedMapProjection(config: {
  bounds: MapBounds;
  width: number;
  height: number;
  preserveAspectRatio?: boolean;
}): { mapRect: WorldRect; projection: MapProjection } {
  const mapRect = fitMapBoundsToRect(config);
  const base = createMapProjection({ bounds: config.bounds, width: mapRect.width, height: mapRect.height });

  const projection: MapProjection = {
    lngLatToWorld(lng, lat) {
      const world = base.lngLatToWorld(lng, lat);
      return { x: world.x + mapRect.x, y: world.y + mapRect.y };
    },
    worldToLngLat(x, y) {
      return base.worldToLngLat(x - mapRect.x, y - mapRect.y);
    },
    lngLatBoundsToWorldRect(inputBounds) {
      const rect = base.lngLatBoundsToWorldRect(inputBounds);
      return { x: rect.x + mapRect.x, y: rect.y + mapRect.y, width: rect.width, height: rect.height };
    },
    worldRectToLngLatBounds(rect) {
      return base.worldRectToLngLatBounds({
        x: rect.x - mapRect.x,
        y: rect.y - mapRect.y,
        width: rect.width,
        height: rect.height,
      });
    },
    projectRing(ring) {
      return ring.map(([lng, lat]) => {
        const point = base.lngLatToWorld(lng, lat);
        return [point.x + mapRect.x, point.y + mapRect.y] as [number, number];
      });
    },
  };

  return { mapRect, projection };
}
