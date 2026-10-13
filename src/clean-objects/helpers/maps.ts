import { latToTileY, lngToTileX, tileXToLng, tileYToLat } from '../../modules/maps/projection';

/**
 * Slippy map tile helpers (https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames).
 *
 * These are thin wrappers over `modules/maps/projection`, which owns the Mercator maths.
 */
export function lon2tile(lon: number, zoom: number): number {
  return Math.floor(lngToTileX(lon, zoom));
}

export function lat2tile(lat: number, zoom: number): number {
  return Math.floor(latToTileY(lat, zoom));
}

export function tile2long(x: number, z: number): number {
  return tileXToLng(x, z);
}

export function tile2lat(y: number, z: number): number {
  return tileYToLat(y, z);
}
