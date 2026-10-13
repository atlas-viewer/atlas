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
  /** Tile rectangles in world units. */
  points: Strand;
  /** Tile rectangles in whole source pixels (`tileSize` square), laid out as a grid. */
  pixelPoints: Strand;
  tiles: MapTileCoordinate[];
  columns: number;
  rows: number;
  count: number;
  minTileX: number;
  maxTileX: number;
  minTileY: number;
  maxTileY: number;
};

export type MapTileGridCoverage = Omit<MapTileGrid, 'points' | 'pixelPoints' | 'tiles'> & {
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
  /** Request `@2x` style tiles when the template uses `{r}`. */
  retina?: boolean;
  /**
   * Restrict the generated grid to the tiles intersecting this lng/lat region.
   * Tile positions are still projected against the full `bounds`, so a windowed
   * image lines up exactly with a full-bounds image at the same zoom.
   */
  region?: MapBounds;
  /** Throw if the generated grid would exceed this many tiles. */
  maxTiles?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function intersectMapBounds(a: MapBounds, b: MapBounds): MapBounds | null {
  const west = Math.max(a.west, b.west);
  const east = Math.min(a.east, b.east);
  const south = Math.max(a.south, b.south);
  const north = Math.min(a.north, b.north);
  if (west >= east || south >= north) {
    return null;
  }
  return { west, south, east, north };
}

export function estimateFiniteTileGridCoverage(config: {
  bounds: MapBounds;
  zoom: number;
  /** Optional sub-region (lng/lat). Only the tile range is affected; the tile span always describes `bounds`. */
  region?: MapBounds;
}): MapTileGridCoverage {
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

  let rangeWest = westTileFloat;
  let rangeEast = eastTileFloat;
  let rangeNorth = northTileFloat;
  let rangeSouth = southTileFloat;
  let empty = false;
  if (config.region) {
    const clipped = intersectMapBounds(config.bounds, config.region);
    if (clipped) {
      rangeWest = lngToTileX(clipped.west, zoom);
      rangeEast = lngToTileX(clipped.east, zoom);
      rangeNorth = latToTileY(clipped.north, zoom);
      rangeSouth = latToTileY(clipped.south, zoom);
    } else {
      empty = true;
    }
  }

  const minTileX = clamp(Math.floor(rangeWest), 0, maxTileIndex);
  const maxTileX = clamp(Math.ceil(rangeEast) - 1, 0, maxTileIndex);
  const minTileY = clamp(Math.floor(rangeNorth), 0, maxTileIndex);
  const maxTileY = clamp(Math.ceil(rangeSouth) - 1, 0, maxTileIndex);

  const columns = empty ? 0 : Math.max(1, maxTileX - minTileX + 1);
  const rows = empty ? 0 : Math.max(1, maxTileY - minTileY + 1);
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
  region?: MapBounds;
  tileSize?: number;
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
    region: config.region,
  });
  const maxTiles = typeof config.maxTiles === 'number' ? config.maxTiles : Number.POSITIVE_INFINITY;
  if (coverage.count > maxTiles) {
    throw new Error(
      `Map tile grid too large at zoom ${zoom}: ${coverage.count} tiles exceeds the configured max (${maxTiles})`
    );
  }

  const points: number[] = [];
  const pixelPoints: number[] = [];
  const tileSize = config.tileSize || 256;
  const tiles: MapTileCoordinate[] = [];

  const hasTiles = coverage.count > 0;
  for (let tileY = coverage.minTileY; hasTiles && tileY <= coverage.maxTileY; tileY++) {
    for (let tileX = coverage.minTileX; tileX <= coverage.maxTileX; tileX++) {
      const tileWestLng = tileXToLng(tileX, zoom);
      const tileEastLng = tileXToLng(tileX + 1, zoom);
      const tileNorthLat = tileYToLat(tileY, zoom);
      const tileSouthLat = tileYToLat(tileY + 1, zoom);

      const northWest = projection.lngLatToWorld(tileWestLng, tileNorthLat);
      const southEast = projection.lngLatToWorld(tileEastLng, tileSouthLat);

      points.push(1, northWest.x, northWest.y, southEast.x, southEast.y);
      // Whole pixels: these size the renderers' tile canvases, and a fractional size (from
      // dividing world units back down) would truncate and leave a gap row/column.
      const px = (tileX - coverage.minTileX) * tileSize;
      const py = (tileY - coverage.minTileY) * tileSize;
      pixelPoints.push(1, px, py, px + tileSize, py + tileSize);
      tiles.push({ x: tileX, y: tileY, z: zoom });
    }
  }

  return {
    // An empty grid keeps one hidden (flag = 0) tile so downstream strand maths stays valid.
    points: dna(points.length ? points : [0, 0, 0, 0, 0]),
    pixelPoints: dna(pixelPoints.length ? pixelPoints : [0, 0, 0, 0, 0]),
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
  readonly retina: boolean;
  readonly region?: MapBounds;
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
      region: props.region,
      maxTiles: props.maxTiles,
      tileSize,
    });

    const id =
      props.id ||
      `map-tiled-image-z${props.zoom}-${props.worldWidth}x${props.worldHeight}-${grid.minTileX}:${grid.maxTileX}-${grid.minTileY}:${grid.maxTileY}`;

    // `points` are source-pixel coordinates (what the canvas renderer sizes its
    // tile canvases from), `displayPoints` are world coordinates (what is used
    // for culling and painting). Both being world coordinates made every tile
    // canvas as large as the tile's footprint in the world.
    super({
      id,
      url: 'map://tile-source',
      scaleFactor,
      points: grid.pixelPoints,
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
    this.retina = !!props.retina;
    this.region = props.region ? { ...props.region } : undefined;
    this.tileCoordinates = grid.tiles;
    this.minTileX = grid.minTileX;
    this.maxTileX = grid.maxTileX;
    this.minTileY = grid.minTileY;
    this.maxTileY = grid.maxTileY;
  }

  applyProps(props: any) {
    super.applyProps(props);
    // TiledImage resets `format` when it is not provided; map tiles are always png-like.
    this.format = 'png';
    // Tile source / grid changes are intentionally not applied in place: tiles that were
    // already decoded are cached per index by the renderers, so the owning layer rebuilds
    // the image instead (see MapTilePyramid).
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
      retina: this.retina,
    });
  }
}
