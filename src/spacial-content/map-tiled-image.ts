import { dna, type Strand } from '@atlas-viewer/dna';
import {
  createMapProjection,
  latToTileY,
  lngToTileX,
  tileXToLng,
  tileYToLat,
  validateMapBounds,
} from '../modules/maps/projection';
import { DEFAULT_OSM_TILE_TEMPLATE, resolveTileUrl } from '../modules/maps/tile-source';
import type { MapBounds, MapTileSource } from '../modules/maps/types';
import { TiledImage } from './tiled-image';

export type MapTileCoordinate = {
  x: number;
  y: number;
  z: number;
};

export type MapTileGrid = {
  points: Strand;
  tiles: MapTileCoordinate[];
  columns: number;
  rows: number;
  count: number;
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
};

export type MapTileGridCoverage = Omit<MapTileGrid, 'points' | 'tiles'> & {
  westTile: number;
  eastTile: number;
  northTile: number;
  southTile: number;
  tileSpanX: number;
  tileSpanY: number;
};

export type MapTiledImageProps = {
  id?: string;
  bounds: MapBounds;
  worldWidth: number;
  worldHeight: number;
  zoom: number;
  tileSize?: number;
  scaleFactor?: number;
  tileSource?: MapTileSource;
  tileUrlTemplate?: string;
  subdomains?: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateFiniteTileGridCoverage(config: { bounds: MapBounds; zoom: number }): MapTileGridCoverage {
  validateMapBounds(config.bounds);

  const zoom = Math.max(0, Math.floor(config.zoom));
  const zoomSize = 2 ** zoom;
  const maxTileIndex = zoomSize - 1;

  const westTileFloat = lngToTileX(config.bounds.west, zoom);
  const eastTileFloat = lngToTileX(config.bounds.east, zoom);
  const northTileFloat = latToTileY(config.bounds.north, zoom);
  const southTileFloat = latToTileY(config.bounds.south, zoom);

  const westTile = clamp(westTileFloat, 0, zoomSize);
  const eastTile = clamp(eastTileFloat, 0, zoomSize);
  const northTile = clamp(northTileFloat, 0, zoomSize);
  const southTile = clamp(southTileFloat, 0, zoomSize);

  // Fractional span represents true source-pixel coverage for the target bounds.
  const tileSpanX = Math.max(1e-9, eastTile - westTile);
  const tileSpanY = Math.max(1e-9, southTile - northTile);

  const minTileX = clamp(Math.floor(westTileFloat), 0, maxTileIndex);
  const maxTileX = clamp(Math.ceil(eastTileFloat) - 1, 0, maxTileIndex);
  const minTileY = clamp(Math.floor(northTileFloat), 0, maxTileIndex);
  const maxTileY = clamp(Math.ceil(southTileFloat) - 1, 0, maxTileIndex);

  const columns = Math.max(1, maxTileX - minTileX + 1);
  const rows = Math.max(1, maxTileY - minTileY + 1);
  return {
    columns,
    rows,
    count: columns * rows,
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    westTile,
    eastTile,
    northTile,
    southTile,
    tileSpanX,
    tileSpanY,
  };
}

export function createFiniteTileGrid(config: {
  bounds: MapBounds;
  zoom: number;
  worldWidth: number;
  worldHeight: number;
  maxTiles?: number;
}): MapTileGrid {
  validateMapBounds(config.bounds);

  const zoom = Math.max(0, Math.floor(config.zoom));
  const projection = createMapProjection({
    bounds: config.bounds,
    width: config.worldWidth,
    height: config.worldHeight,
  });

  const coverage = estimateFiniteTileGridCoverage({
    bounds: config.bounds,
    zoom,
  });
  const maxTiles = typeof config.maxTiles === 'number' ? config.maxTiles : Number.POSITIVE_INFINITY;
  if (coverage.count > maxTiles) {
    throw new Error(
      `Map tile grid too large at zoom ${zoom}: ${coverage.count} tiles exceeds the configured max (${maxTiles})`
    );
  }

  const points: number[] = [];
  const tiles: MapTileCoordinate[] = [];

  for (let tileY = coverage.minTileY; tileY <= coverage.maxTileY; tileY++) {
    for (let tileX = coverage.minTileX; tileX <= coverage.maxTileX; tileX++) {
      const tileWestLng = tileXToLng(tileX, zoom);
      const tileEastLng = tileXToLng(tileX + 1, zoom);
      const tileNorthLat = tileYToLat(tileY, zoom);
      const tileSouthLat = tileYToLat(tileY + 1, zoom);

      const northWest = projection.lngLatToWorld(tileWestLng, tileNorthLat);
      const southEast = projection.lngLatToWorld(tileEastLng, tileSouthLat);

      points.push(1, northWest.x, northWest.y, southEast.x, southEast.y);
      tiles.push({ x: tileX, y: tileY, z: zoom });
    }
  }

  return {
    points: dna(points.length ? points : [0]),
    tiles,
    columns: coverage.columns,
    rows: coverage.rows,
    count: coverage.count,
    minTileX: coverage.minTileX,
    maxTileX: coverage.maxTileX,
    minTileY: coverage.minTileY,
    maxTileY: coverage.maxTileY,
  };
}

export class MapTiledImage extends TiledImage {
  readonly zoom: number;
  readonly bounds: MapBounds;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tileSize: number;
  readonly tileSource: MapTileSource;
  readonly subdomains: string[];
  readonly tileCoordinates: MapTileCoordinate[];
  readonly minTileX: number;
  readonly maxTileX: number;
  readonly minTileY: number;
  readonly maxTileY: number;

  constructor(props: MapTiledImageProps) {
    const scaleFactor = props.scaleFactor || 1;
    const tileSize = props.tileSize || 256;
    const tileSource = props.tileSource || props.tileUrlTemplate || DEFAULT_OSM_TILE_TEMPLATE;
    const grid = createFiniteTileGrid({
      bounds: props.bounds,
      zoom: props.zoom,
      worldWidth: props.worldWidth,
      worldHeight: props.worldHeight,
    });

    const id =
      props.id ||
      `map-tiled-image-z${props.zoom}-${props.worldWidth}x${props.worldHeight}-${grid.minTileX}:${grid.maxTileX}-${grid.minTileY}:${grid.maxTileY}`;

    super({
      id,
      url: 'map://tile-source',
      scaleFactor,
      points: grid.points,
      displayPoints: grid.points,
      tileWidth: tileSize,
      tileHeight: tileSize,
      width: props.worldWidth,
      height: props.worldHeight,
      columns: grid.columns,
      rows: grid.rows,
      format: 'png',
      version3: false,
    });

    this.zoom = Math.max(0, Math.floor(props.zoom));
    this.bounds = { ...props.bounds };
    this.worldWidth = props.worldWidth;
    this.worldHeight = props.worldHeight;
    this.tileSize = tileSize;
    this.tileSource = tileSource;
    this.subdomains = [...(props.subdomains || [])];
    this.tileCoordinates = grid.tiles;
    this.minTileX = grid.minTileX;
    this.maxTileX = grid.maxTileX;
    this.minTileY = grid.minTileY;
    this.maxTileY = grid.maxTileY;
  }

  getImageUrl(index: number): string {
    const tile = this.tileCoordinates[index];
    if (!tile) {
      return '';
    }

    return resolveTileUrl(this.tileSource, {
      z: tile.z,
      x: tile.x,
      y: tile.y,
      tileSize: this.tileSize,
      subdomains: this.subdomains,
    });
  }
}
