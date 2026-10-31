import type { Strand } from '@atlas-viewer/dna';
import { createMapProjection } from '../modules/maps/projection';
import { DEFAULT_OSM_TILE_TEMPLATE } from '../modules/maps/tile-source';
import type { MapBounds, MapTileSource } from '../modules/maps/types';
import type { Paint } from '../world-objects';
import { CompositeResource, type CompositeResourceProps } from './composite-resource';
import { estimateFiniteTileGridCoverage, MapTiledImage, type MapTileGridCoverage } from './map-tiled-image';

export const DEFAULT_MAP_MAX_TILES_PER_LAYER = 16000;
export const DEFAULT_MAP_MAX_TOTAL_TILES = 120000;
export const DEFAULT_MAP_MAX_QUALITY_LEVELS = 12;
export const DEFAULT_MAP_MAX_TILES_PER_WINDOW = 2048;
export const DEFAULT_MAP_WINDOW_MARGIN = 2;

export type MapTileLevel = {
  zoom: number;
  coverage: MapTileGridCoverage;
  /** World units per source pixel at this zoom. */
  scaleFactor: number;
};

export type MapTilePlanConfig = {
  bounds: MapBounds;
  worldWidth: number;
  worldHeight: number;
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  maxQualityLevels?: number;
  maxTilesPerLayer?: number;
  maxTotalTiles?: number;
};

export type MapTilePlan = {
  /** Levels that cover the whole bounds, ordered coarse -> fine. */
  levels: MapTileLevel[];
  minZoom: number;
  maxZoom: number;
  /** World units per source pixel at zoom 0. Level scale factor is `zoomZeroScale / 2^zoom`. */
  zoomZeroScale: number;
};

function scaleFactorFor(coverage: MapTileGridCoverage, tileSize: number, worldWidth: number, worldHeight: number) {
  const sourceWidth = coverage.tileSpanX * tileSize;
  const sourceHeight = coverage.tileSpanY * tileSize;
  return Math.max(worldWidth / sourceWidth, worldHeight / sourceHeight);
}

/**
 * Decides which zoom levels can be built eagerly (covering the whole bounds) within the configured
 * tile budgets. Deeper zooms are served by viewport windows (see MapTilePyramid).
 */
export function planMapTileLevels(config: MapTilePlanConfig): MapTilePlan {
  for (const value of [config.worldWidth, config.worldHeight]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Map dimensions must be positive finite numbers');
  }
  for (const value of [config.minZoom ?? 0, config.maxZoom ?? 19]) {
    if (!Number.isInteger(value) || value < 0 || value > 22)
      throw new Error('Map zoom must be an integer between 0 and 22');
  }
  if ((config.minZoom ?? 0) > (config.maxZoom ?? 19)) throw new Error('minZoom must not exceed maxZoom');
  for (const value of [
    config.tileSize ?? 256,
    config.maxQualityLevels ?? DEFAULT_MAP_MAX_QUALITY_LEVELS,
    config.maxTilesPerLayer ?? DEFAULT_MAP_MAX_TILES_PER_LAYER,
    config.maxTotalTiles ?? DEFAULT_MAP_MAX_TOTAL_TILES,
  ]) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('Tile size and budgets must be positive safe integers');
  }
  const tileSize = config.tileSize ?? 256;
  const minZoom = Math.max(0, Math.floor(config.minZoom ?? 0));
  const maxZoom = Math.max(minZoom, Math.floor(config.maxZoom ?? 19));
  const maxQualityLevels = config.maxQualityLevels ?? DEFAULT_MAP_MAX_QUALITY_LEVELS;
  const maxTilesPerLayer = config.maxTilesPerLayer ?? DEFAULT_MAP_MAX_TILES_PER_LAYER;
  const maxTotalTiles = config.maxTotalTiles ?? DEFAULT_MAP_MAX_TOTAL_TILES;

  const coverageAt = (zoom: number) => estimateFiniteTileGridCoverage({ bounds: config.bounds, zoom });
  const toLevel = (zoom: number, coverage: MapTileGridCoverage): MapTileLevel => ({
    zoom,
    coverage,
    scaleFactor: scaleFactorFor(coverage, tileSize, config.worldWidth, config.worldHeight),
  });

  const levels: MapTileLevel[] = [];
  let totalTiles = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const coverage = coverageAt(z);
    if (coverage.count > maxTilesPerLayer || totalTiles + coverage.count > maxTotalTiles) {
      break;
    }
    totalTiles += coverage.count;
    levels.push(toLevel(z, coverage));
  }

  if (!levels.length) {
    let fallbackZoom = minZoom;
    while (fallbackZoom > 0) {
      if (coverageAt(fallbackZoom).count <= Math.min(maxTilesPerLayer, maxTotalTiles)) {
        break;
      }
      fallbackZoom -= 1;
    }
    levels.push(toLevel(fallbackZoom, coverageAt(fallbackZoom)));
  }

  let kept = levels;
  if (levels.length > maxQualityLevels) {
    const lowest = levels[0];
    const highest = levels[levels.length - 1];
    const floorZoom = Math.max(lowest.zoom + 1, highest.zoom - (maxQualityLevels - 2));
    kept = [lowest, ...levels.filter((level) => level.zoom >= floorZoom)].filter(
      (level, index, arr) => index === 0 || level.zoom !== arr[index - 1].zoom
    );
  }

  const zoomZeroCoverage = coverageAt(0);
  return {
    levels: kept,
    minZoom,
    maxZoom,
    zoomZeroScale: scaleFactorFor(zoomZeroCoverage, tileSize, config.worldWidth, config.worldHeight),
  };
}

export type MapTilePyramidProps = {
  id: string;
  bounds: MapBounds;
  /** Size of the map in the layer's own coordinate frame. */
  worldWidth: number;
  worldHeight: number;
  tileSize?: number;
  tileSource?: MapTileSource;
  tileUrlTemplate?: string;
  /** Changes whenever `tileSource` behaves differently (functions can not be compared meaningfully). */
  sourceKey?: string;
  subdomains?: string[];
  retina?: boolean;
  minZoom?: number;
  maxZoom?: number;
  maxQualityLevels?: number;
  maxTilesPerLayer?: number;
  maxTotalTiles?: number;
  /**
   * Build deeper-than-budget zoom levels on demand, covering only the area around the viewport.
   * Without this, `maxZoom` is capped by `maxTilesPerLayer` for the bounds' footprint.
   */
  viewportWindows?: boolean;
  maxTilesPerWindow?: number;
  /** Extra area kept around the viewport, as a multiple of the viewport size. */
  windowMargin?: number;
  renderOptions?: CompositeResourceProps;
};

type WindowRect = { x1: number; y1: number; x2: number; y2: number };

type PyramidWindow = {
  zoom: number;
  /** `null` when no window could be built for this zoom (e.g. the viewport alone exceeds the tile budget). */
  image: MapTiledImage | null;
  /** Area (map frame) the window covers. */
  rect: WindowRect;
  /** Reuse bounds based on the margin actually affordable for this window. */
  reuseRect?: WindowRect;
};

export const MAP_TILE_PYRAMID_RENDER_OPTIONS: CompositeResourceProps = {
  layerPolicy: 'always-blend',
  renderLayers: 2,
  renderSmallestFallback: true,
  prefetchRadius: 0,
  quality: 0.9,
  useDevicePixelRatio: false,
  fadeInMs: 300,
  fadeFallbackTiles: true,
  fadeOnLayerChange: true,
  clipToBounds: true,
  // Map levels have fractional scales (world units per source pixel); never merge them.
  minScaleGap: 0,
};

const RENDER_OPTION_KEYS = [
  'renderSmallestFallback',
  'renderLayers',
  'minSize',
  'maxImageSize',
  'quality',
  'useDevicePixelRatio',
  'layerPolicy',
  'loadingBias',
  'prefetchRadius',
  'fadeInMs',
  'fadeFallbackTiles',
  'fadeOnLayerChange',
  'clipToBounds',
  'minScaleGap',
] as const;

function sameBounds(a: MapBounds, b: MapBounds) {
  return a.west === b.west && a.south === b.south && a.east === b.east && a.north === b.north;
}

function sameList(a: string[] | undefined, b: string[] | undefined) {
  const left = a || [];
  const right = b || [];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

let windowCounter = 0;

/**
 * A multi-zoom OSM-style tile layer.
 *
 * - Zoom levels that fit the tile budget are built up-front for the whole bounds.
 * - Deeper levels are built lazily as "windows": a tile grid for just the region around the
 *   viewport, rebuilt when the viewport leaves it. This is what makes street level zoom
 *   reachable over large bounds.
 * - Geometry / source changes rebuild the levels in place, so React does not have to remount.
 */
export class MapTilePyramid extends CompositeResource {
  private config: Omit<MapTilePyramidProps, 'id'> & { tileSize: number; viewportWindows: boolean };
  private plan: MapTilePlan;
  private windows = new Map<number, PyramidWindow>();
  private staticImages: MapTiledImage[] = [];
  private lastTarget?: WindowRect;
  private lastScale = 0;
  private windowsDirty = false;
  private readonly baseId: string;

  /** Number of times the static levels were (re)built. Mostly useful for diagnostics and tests. */
  buildCount = 0;

  private validateWindows(config: MapTilePyramidProps | MapTilePyramid['config']) {
    const budget = config.maxTilesPerWindow ?? DEFAULT_MAP_MAX_TILES_PER_WINDOW;
    const margin = config.windowMargin ?? DEFAULT_MAP_WINDOW_MARGIN;
    if (!Number.isSafeInteger(budget) || budget <= 0)
      throw new Error('Window tile budget must be a positive safe integer');
    if (!Number.isFinite(margin) || margin < 0) throw new Error('Window margin must be finite and nonnegative');
  }

  constructor(props: MapTilePyramidProps) {
    super({
      id: props.id,
      width: props.worldWidth,
      height: props.worldHeight,
      images: [],
      renderOptions: { ...MAP_TILE_PYRAMID_RENDER_OPTIONS, ...(props.renderOptions || {}) },
    });
    this.baseId = props.id;
    const { id: _id, ...rest } = props;
    this.config = {
      ...rest,
      tileSize: props.tileSize ?? 256,
      viewportWindows: props.viewportWindows !== false,
    };
    this.validateWindows(this.config);
    this.plan = planMapTileLevels(this.config);
    this.rebuildStaticLevels();
  }

  get tileSize() {
    return this.config.tileSize;
  }

  get bounds() {
    return this.config.bounds;
  }

  get zoomLevels(): number[] {
    return this.allImages
      .filter((image): image is MapTiledImage => image instanceof MapTiledImage)
      .map((image) => image.zoom)
      .sort((a, b) => a - b);
  }

  get windowZooms(): number[] {
    return [...this.windows.keys()].sort((a, b) => a - b);
  }

  get staticMaxZoom(): number {
    return this.plan.levels[this.plan.levels.length - 1].zoom;
  }

  getPlan(): MapTilePlan {
    return this.plan;
  }

  private get tileSource(): MapTileSource {
    return this.config.tileSource || this.config.tileUrlTemplate || DEFAULT_OSM_TILE_TEMPLATE;
  }

  private rebuildStaticLevels() {
    for (const image of this.allImages) image.dispose?.();
    this.buildCount++;
    this.windows.clear();
    this.allImages = [];
    this.images = [];

    this.staticImages = this.plan.levels.map(
      (level) =>
        new MapTiledImage({
          // Tile state is keyed by id + scale + index, so every rebuild needs fresh ids.
          id: `${this.baseId}-g${this.buildCount}-z${level.zoom}`,
          bounds: this.config.bounds,
          worldWidth: this.config.worldWidth,
          worldHeight: this.config.worldHeight,
          zoom: level.zoom,
          scaleFactor: level.scaleFactor,
          tileSize: this.config.tileSize,
          tileSource: this.tileSource,
          subdomains: this.config.subdomains,
          retina: this.config.retina,
        })
    );
    this.addImages(this.staticImages);
    this.windowsDirty = this.config.viewportWindows;
  }

  applyProps(props: any) {
    if (!props) {
      return;
    }

    // Explicitly removed React props restore defaults; omitted imperative updates stay partial.
    props = { ...props };
    const defaults = {
      retina: false,
      subdomains: [],
      maxQualityLevels: DEFAULT_MAP_MAX_QUALITY_LEVELS,
      maxTilesPerLayer: DEFAULT_MAP_MAX_TILES_PER_LAYER,
      maxTotalTiles: DEFAULT_MAP_MAX_TOTAL_TILES,
      maxTilesPerWindow: DEFAULT_MAP_MAX_TILES_PER_WINDOW,
      windowMargin: DEFAULT_MAP_WINDOW_MARGIN,
    };
    for (const key of Object.keys(defaults)) {
      if (key in props && props[key] === undefined) props[key] = defaults[key as keyof typeof defaults];
    }

    const nextRenderOptions: CompositeResourceProps = {};
    const source = props.renderOptions ? { ...props, ...props.renderOptions } : props;
    for (const key of RENDER_OPTION_KEYS) {
      if (typeof source[key] !== 'undefined') {
        (nextRenderOptions as any)[key] = source[key];
      }
    }
    if (props.renderOptions) {
      // Keep map defaults for anything the caller did not override.
      Object.assign(nextRenderOptions, {
        ...MAP_TILE_PYRAMID_RENDER_OPTIONS,
        ...props.renderOptions,
      });
    }
    super.applyProps(nextRenderOptions);

    let rebuild = false;
    const next = { ...this.config };

    if (props.bounds && !sameBounds(props.bounds, next.bounds)) {
      next.bounds = props.bounds;
      rebuild = true;
    }
    if (typeof props.worldWidth === 'number' && props.worldWidth !== next.worldWidth) {
      next.worldWidth = props.worldWidth;
      rebuild = true;
    }
    if (typeof props.worldHeight === 'number' && props.worldHeight !== next.worldHeight) {
      next.worldHeight = props.worldHeight;
      rebuild = true;
    }
    if (typeof props.tileSize === 'number' && props.tileSize !== next.tileSize) {
      next.tileSize = props.tileSize;
      rebuild = true;
    }
    if (typeof props.sourceKey === 'string' && props.sourceKey !== next.sourceKey) {
      next.sourceKey = props.sourceKey;
      next.tileSource = props.tileSource;
      next.tileUrlTemplate = props.tileUrlTemplate;
      rebuild = true;
    } else if (typeof props.sourceKey === 'undefined') {
      const nextSource = props.tileSource || props.tileUrlTemplate;
      if (nextSource && nextSource !== (next.tileSource || next.tileUrlTemplate)) {
        next.tileSource = props.tileSource;
        next.tileUrlTemplate = props.tileUrlTemplate;
        rebuild = true;
      }
    }
    if (props.subdomains && !sameList(props.subdomains, next.subdomains)) {
      next.subdomains = [...props.subdomains];
      rebuild = true;
    }
    if (typeof props.retina === 'boolean' && props.retina !== !!next.retina) {
      next.retina = props.retina;
      rebuild = true;
    }
    for (const key of [
      'minZoom',
      'maxZoom',
      'maxQualityLevels',
      'maxTilesPerLayer',
      'maxTotalTiles',
      'maxTilesPerWindow',
      'windowMargin',
    ] as const) {
      if (typeof props[key] === 'number' && props[key] !== next[key]) {
        (next as any)[key] = props[key];
        rebuild = true;
      }
    }
    if (typeof props.viewportWindows === 'boolean' && props.viewportWindows !== next.viewportWindows) {
      next.viewportWindows = props.viewportWindows;
      rebuild = true;
    }

    if (!rebuild) {
      return;
    }

    this.validateWindows(next);
    const plan = planMapTileLevels(next);
    const sizeChanged = next.worldWidth !== this.config.worldWidth || next.worldHeight !== this.config.worldHeight;
    this.config = next;
    if (sizeChanged) {
      this.display.width = next.worldWidth;
      this.display.height = next.worldHeight;
      this.points.set([1, 0, 0, next.worldWidth, next.worldHeight]);
      this.display.points.set([1, 0, 0, next.worldWidth, next.worldHeight]);
    }
    this.plan = plan;
    this.rebuildStaticLevels();
    this._sortByScales();
    this.__revision++;
  }

  // --- viewport windows ---------------------------------------------------------------------

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    if (this.config.viewportWindows && scale && scale > 0 && target[3] - target[1] > 1 && target[4] - target[2] > 1) {
      this.lastTarget = {
        x1: target[1] - this.x,
        y1: target[2] - this.y,
        x2: target[3] - this.x,
        y2: target[4] - this.y,
      };
      this.lastScale = scale;
      if (this.needsWindowRefresh()) {
        this.windowsDirty = true;
      }
    }
    return super.getAllPointsAt(target, aggregate, scale);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> {
    const updates = super.getScheduledUpdates(target, scaleFactor);
    if (this.windowsDirty) {
      this.windowsDirty = false;
      return [this.refreshWindows as any, ...updates];
    }
    return updates;
  }

  /** Deepest zoom that is worth having a window for at the current viewport scale. */
  private desiredWindowZoom(): number {
    const { renderOptions } = this;
    const dpr = renderOptions.useDevicePixelRatio && typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const exact = Math.log2(this.plan.zoomZeroScale * this.lastScale * dpr * (renderOptions.quality || 1));
    return Math.min(this.plan.maxZoom, Math.max(0, Math.ceil(exact) + 1));
  }

  private requiredWindowZooms(): number[] {
    if (!this.config.viewportWindows || !this.lastTarget || this.lastScale <= 0) {
      return [];
    }
    const from = this.staticMaxZoom + 1;
    const to = this.desiredWindowZoom();
    const zooms: number[] = [];
    for (let z = from; z <= to; z++) {
      zooms.push(z);
    }
    return zooms;
  }

  private needsWindowRefresh(): boolean {
    const required = this.requiredWindowZooms();
    if (required.length !== this.windows.size) {
      return true;
    }
    const target = this.lastTarget as WindowRect;
    return required.some((zoom) => !this.windowCovers(this.windows.get(zoom), target));
  }

  private windowCovers(existing: PyramidWindow | undefined, target: WindowRect): boolean {
    if (!existing) return false;
    if (!existing.image) {
      // A failed budget attempt is stable until the viewport changes. A smaller
      // viewport may fit, so retry even when it is contained in the old rectangle.
      return Object.keys(target).every(
        (key) => target[key as keyof WindowRect] === existing.rect[key as keyof WindowRect]
      );
    }
    const rect = existing.reuseRect || existing.rect;
    return (
      (rect.x1 <= 0 || target.x1 >= rect.x1) &&
      (rect.y1 <= 0 || target.y1 >= rect.y1) &&
      (rect.x2 >= this.config.worldWidth || target.x2 <= rect.x2) &&
      (rect.y2 >= this.config.worldHeight || target.y2 <= rect.y2)
    );
  }

  private buildWindow(zoom: number, target: WindowRect): PyramidWindow {
    const { bounds, worldWidth, worldHeight, tileSize } = this.config;
    const maxTiles = this.config.maxTilesPerWindow ?? DEFAULT_MAP_MAX_TILES_PER_WINDOW;
    const margin = this.config.windowMargin ?? DEFAULT_MAP_WINDOW_MARGIN;
    const projection = createMapProjection({ bounds, width: worldWidth, height: worldHeight });
    const coverage = estimateFiniteTileGridCoverage({ bounds, zoom });
    const scaleFactor = scaleFactorFor(coverage, tileSize, worldWidth, worldHeight);

    const cx = (target.x1 + target.x2) / 2;
    const cy = (target.y1 + target.y2) / 2;
    const halfW = (target.x2 - target.x1) / 2;
    const halfH = (target.y2 - target.y1) / 2;

    let currentMargin = margin;
    for (let attempt = 0; attempt < 6; attempt++) {
      const rect: WindowRect = {
        x1: Math.max(0, cx - halfW * (1 + currentMargin)),
        y1: Math.max(0, cy - halfH * (1 + currentMargin)),
        x2: Math.min(worldWidth, cx + halfW * (1 + currentMargin)),
        y2: Math.min(worldHeight, cy + halfH * (1 + currentMargin)),
      };
      if (rect.x2 <= rect.x1 || rect.y2 <= rect.y1) {
        return { zoom, image: null, rect: { ...target } };
      }

      const region = projection.worldRectToLngLatBounds({
        x: rect.x1,
        y: rect.y1,
        width: rect.x2 - rect.x1,
        height: rect.y2 - rect.y1,
      });
      const estimated = estimateFiniteTileGridCoverage({ bounds, zoom, region });
      if (estimated.count <= maxTiles) {
        const image = new MapTiledImage({
          id: `${this.baseId}-z${zoom}-w${++windowCounter}`,
          bounds,
          worldWidth,
          worldHeight,
          zoom,
          scaleFactor,
          tileSize,
          tileSource: this.tileSource,
          subdomains: this.config.subdomains,
          retina: this.config.retina,
          region,
          maxTiles,
        });
        const slackX = (halfW * currentMargin) / 2;
        const slackY = (halfH * currentMargin) / 2;
        const reuseRect = {
          x1: rect.x1 <= 0 ? 0 : rect.x1 + slackX,
          y1: rect.y1 <= 0 ? 0 : rect.y1 + slackY,
          x2: rect.x2 >= worldWidth ? worldWidth : rect.x2 - slackX,
          y2: rect.y2 >= worldHeight ? worldHeight : rect.y2 - slackY,
        };
        return { zoom, image, rect, reuseRect };
      }

      if (currentMargin <= 0) {
        // The viewport alone needs more tiles than allowed; skip this level.
        break;
      }
      currentMargin = Math.max(0, currentMargin / 2 - 0.01);
    }
    return { zoom, image: null, rect: { ...target } };
  }

  refreshWindows = (): void => {
    if (!this.config.viewportWindows || !this.lastTarget) {
      return;
    }
    const required = new Set(this.requiredWindowZooms());
    const target = this.lastTarget;
    let changed = false;

    for (const [zoom, existing] of [...this.windows]) {
      if (!required.has(zoom)) {
        if (existing.image) {
          this.removeChild(existing.image);
          changed = true;
        }
        this.windows.delete(zoom);
      }
    }

    for (const zoom of required) {
      const existing = this.windows.get(zoom);
      if (this.windowCovers(existing, target)) continue;

      const built = this.buildWindow(zoom, target);
      if (existing?.image) {
        this.removeChild(existing.image);
        changed = true;
      }
      if (built.image) {
        this.addImages([built.image]);
        changed = true;
      }
      this.windows.set(zoom, built);
    }

    if (changed) {
      this._sortByScales();
      this.__revision++;
    }
  };
}
