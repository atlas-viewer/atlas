import {
  latitudeToMercatorY,
  longitudeToMercatorX,
  MAX_MERCATOR_LATITUDE,
  mercatorXToLongitude,
  mercatorYToLatitude,
} from './modules/maps/projection';
import type { MapBounds, MapGeoJSONInput } from './modules/maps/types';
import { validateResourceMask } from './modules/maps/warped/mesh';
import { createWarpTransformer } from './modules/maps/warped/transformer';
import type { WarpControlPoint, WarpTransformationType, WarpTransformer } from './modules/maps/warped/types';
import type { MapWarpedImageService } from './modules/react-reconciler/components/MapWarpedImage';

type Point = [number, number];
export type LoadedAllmapsMap = {
  id: string;
  service: MapWarpedImageService;
  points: WarpControlPoint[];
  transformer: WarpTransformer;
  mask: Point[];
};
export type LoadedAllmaps = {
  url: string;
  maps: LoadedAllmapsMap[];
  bounds: MapBounds;
  frameHeight: number;
  warnings: string[];
  markers: MapGeoJSONInput;
  outlines: MapGeoJSONInput;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
function point(value: unknown): Point {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('Expected a finite coordinate pair.');
  }
  return value as Point;
}
function httpUrl(value: unknown, base?: string): string {
  if (typeof value !== 'string') throw new Error('Expected an HTTP(S) URL.');
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP(S) URL without credentials.');
  return url.href;
}
function annotationUrl(input: string): string {
  let url = new URL(httpUrl(input.trim()));
  for (let depth = 0; depth < 5; depth++) {
    if (url.hostname === 'allmaps.org' || url.hostname.endsWith('.allmaps.org')) {
      const nested = new URLSearchParams(url.search).get('url');
      if (nested) {
        url = new URL(httpUrl(nested));
        continue;
      }
      if (url.hostname !== 'annotations.allmaps.org') {
        if (/^\/(maps|images|manifests)\/[a-f0-9]{16}(?:@[a-f0-9]+)?\/?$/.test(url.pathname)) {
          return `https://annotations.allmaps.org${url.pathname}`;
        }
        throw new Error(
          'Paste an Allmaps Viewer/Editor link with ?url=, or an annotations.allmaps.org map, image or manifest URL.'
        );
      }
    }
    url.hash = '';
    return url.href;
  }
  throw new Error('Too many nested Allmaps URLs.');
}
async function fetchJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  try {
    return object(await response.json());
  } catch {
    throw new Error(`Expected JSON from ${url}. Use an annotation URL, not an HTML collection page.`);
  }
}

// Allmaps identifiers are the first 16 hex digits of the SHA-1 of the canonical IIIF ID.
// https://github.com/allmaps/allmaps/blob/main/packages/id/src/index.ts
async function iiifAnnotationUrl(doc: Record<string, unknown>): Promise<string> {
  const isManifest = doc.type === 'Manifest' || doc['@type'] === 'sc:Manifest';
  if (!isManifest && !(positive(doc.width) && positive(doc.height)))
    throw new Error('No georeference Annotation or AnnotationPage found.');
  const id = httpUrl(doc.id ?? doc['@id']);
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(id));
  const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `https://annotations.allmaps.org/${isManifest ? 'manifests' : 'images'}/${hash}`;
}

async function readAnnotations(url: string, signal: AbortSignal) {
  const annotations: Record<string, unknown>[] = [];
  const visited = new Set<string>();
  async function visit(value: unknown, base: string): Promise<void> {
    let doc = typeof value === 'string' ? ({ id: value } as Record<string, unknown>) : object(value);
    if (!doc.body && !Array.isArray(doc.items)) {
      const href = httpUrl(doc.id ?? doc['@id'], base);
      if (visited.has(href)) return;
      visited.add(href);
      if (visited.size > 100) throw new Error('This proof of concept supports up to 100 linked annotation documents.');
      doc = await fetchJson(href, signal);
      base = href;
    }
    if (doc.type === 'Annotation') {
      if (
        doc.motivation === 'georeferencing' ||
        (Array.isArray(doc.motivation) && doc.motivation.includes('georeferencing'))
      )
        annotations.push(doc);
    } else if (doc.type === 'AnnotationPage' && Array.isArray(doc.items)) {
      for (const item of doc.items) await visit(item, base);
      if (doc.next) await visit(doc.next, base);
    } else {
      throw new Error('Expected a georeference Annotation or AnnotationPage.');
    }
  }
  let doc = await fetchJson(url, signal);
  if (doc.type !== 'Annotation' && doc.type !== 'AnnotationPage') {
    url = await iiifAnnotationUrl(doc);
    doc = await fetchJson(url, signal);
  }
  visited.add(url);
  await visit(doc, url);
  if (!annotations.length) throw new Error('This URL contains no georeferenced maps.');
  return { url, annotations };
}

function transformation(body: Record<string, unknown>): WarpTransformationType {
  if (!body.transformation) return 'polynomial1';
  const config = object(body.transformation);
  const type = config.type;
  if (type === 'polynomial') {
    const order = config.options ? object(config.options).order ?? 1 : 1;
    if (order === 1 || order === 2 || order === 3) return `polynomial${order}`;
  }
  if (
    [
      'straight',
      'helmert',
      'affine',
      'polynomial1',
      'polynomial2',
      'polynomial3',
      'projective',
      'thinPlateSpline',
    ].includes(String(type))
  ) {
    return type as WarpTransformationType;
  }
  throw new Error(
    `Atlas does not support annotation transformation ${String(type)} (${JSON.stringify(config.options)}).`
  );
}
function resourceMask(selector: unknown): Point[] {
  if (!selector) return [];
  const selection = object(selector);
  if (selection.type === 'SvgSelector' && typeof selection.value === 'string') {
    // Parse only numbers from an inert XML document; never insert external SVG into the page.
    const svg = new DOMParser().parseFromString(selection.value, 'image/svg+xml');
    const polygons = svg.querySelectorAll('polygon');
    const numbers = polygons[0]
      ?.getAttribute('points')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      !svg.querySelector('parsererror') &&
      polygons.length === 1 &&
      numbers &&
      numbers.length >= 6 &&
      numbers.length % 2 === 0 &&
      numbers.every(Number.isFinite)
    ) {
      const mask: Point[] = [];
      for (let i = 0; i < numbers.length; i += 2) mask.push([numbers[i], numbers[i + 1]]);
      validateResourceMask(mask);
      return mask;
    }
  }
  throw new Error('Unsupported resource mask: expected one SVG polygon.');
}
function serviceInfo(info: Record<string, unknown>, id: string): MapWarpedImageService {
  if (!positive(info.width) || !positive(info.height)) throw new Error(`${id}: invalid IIIF dimensions.`);
  if (!Array.isArray(info.tiles) || !info.tiles.length)
    throw new Error(`${id}: no advertised IIIF tile pyramid; native warped images currently require one.`);
  const tiles = info.tiles.map((value) => {
    const tile = object(value);
    if (
      !positive(tile.width) ||
      (tile.height !== undefined && !positive(tile.height)) ||
      !Array.isArray(tile.scaleFactors) ||
      !tile.scaleFactors.length ||
      !tile.scaleFactors.every(positive)
    ) {
      throw new Error(`${id}: invalid IIIF tile metadata.`);
    }
    return {
      width: tile.width,
      height: tile.height as number | undefined,
      scaleFactors: tile.scaleFactors as number[],
    };
  });
  // Native MapWarpedImage eagerly builds all tile meshes; avoid locking up the browser on huge services.
  const tileCount = tiles.reduce(
    (sum, tile) =>
      sum +
      tile.scaleFactors.reduce(
        (n, scale) =>
          n +
          Math.ceil((info.width as number) / (tile.width * scale)) *
            Math.ceil((info.height as number) / ((tile.height || tile.width) * scale)),
        0
      ),
    0
  );
  if (tileCount > 30000)
    throw new Error(
      `${id}: ${tileCount} tile meshes exceeds the 30,000 tile limit; native viewport-lazy mesh creation is needed.`
    );
  const context = JSON.stringify(info['@context']);
  const version3 = info.type === 'ImageService3' || context?.includes('/image/3/');
  return {
    id: httpUrl(info.id ?? info['@id'] ?? id),
    width: info.width,
    height: info.height,
    tiles,
    version3: !!version3,
  };
}

function projected(point: Point): Point {
  const [lng, lat] = point;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > MAX_MERCATOR_LATITUDE) {
    throw new Error(
      'Warp extends outside the supported OSM/Mercator world. Check the control points and transformation.'
    );
  }
  return [longitudeToMercatorX(lng), latitudeToMercatorY(lat)];
}
function fitMaps(maps: LoadedAllmapsMap[]) {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const map of maps) {
    const ring: Point[] = map.mask.length
      ? map.mask
      : [
          [0, 0],
          [map.service.width, 0],
          [map.service.width, map.service.height],
          [0, map.service.height],
        ];
    const include = (x: number, y: number) => {
      const [mx, my] = projected(map.transformer.toGeo(x, y));
      left = Math.min(left, mx);
      right = Math.max(right, mx);
      top = Math.min(top, my);
      bottom = Math.max(bottom, my);
    };
    // Include the boundary even for thin masks which can fall between grid points.
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length];
      for (let i = 0; i <= 64; i++) include(a[0] + ((b[0] - a[0]) * i) / 64, a[1] + ((b[1] - a[1]) * i) / 64);
    });
    // shortcut: interior grid plus padding covers ordinary warps; pathological folds need adaptive bounds.
    const minX = Math.min(...ring.map((p) => p[0])),
      maxX = Math.max(...ring.map((p) => p[0]));
    const minY = Math.min(...ring.map((p) => p[1])),
      maxY = Math.max(...ring.map((p) => p[1]));
    for (let row = 0; row <= 64; row++)
      for (let col = 0; col <= 64; col++) {
        const x = minX + ((maxX - minX) * col) / 64,
          y = minY + ((maxY - minY) * row) / 64;
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i],
            b = ring[j];
          if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        if (inside) include(x, y);
      }
  }
  if (right - left >= 0.5)
    throw new Error('Maps spanning 180° or crossing the antimeridian are not supported by this demo.');
  if (right <= left || bottom <= top) throw new Error('The transformed maps have empty bounds.');
  const dx = (right - left) * 0.08,
    dy = (bottom - top) * 0.08;
  left = Math.max(0, left - dx);
  right = Math.min(1, right + dx);
  top = Math.max(0, top - dy);
  bottom = Math.min(1, bottom + dy);
  return {
    bounds: {
      west: mercatorXToLongitude(left),
      east: mercatorXToLongitude(right),
      south: mercatorYToLatitude(bottom),
      north: mercatorYToLatitude(top),
    },
    frameHeight: (2400 * (bottom - top)) / (right - left),
  };
}
/** Resolve an Allmaps/IIIF URL in a browser. Abort with `signal`; failed sheets become warnings. */
export async function loadAllmaps(input: string, signal: AbortSignal): Promise<LoadedAllmaps> {
  const { url, annotations } = await readAnnotations(annotationUrl(input), signal);
  const services = new Map<string, Promise<MapWarpedImageService>>();
  const warnings: string[] = [];
  const maps: LoadedAllmapsMap[] = [];
  for (const [index, annotation] of annotations.entries()) {
    const id = typeof annotation.id === 'string' ? annotation.id : `Map ${index + 1}`;
    try {
      const target = object(annotation.target);
      // Current georef extension and the older Allmaps target.service/pixelCoords representation.
      const source =
        target.source && typeof target.source === 'object'
          ? object(target.source)
          : object(Array.isArray(target.service) ? target.service[0] : undefined);
      const serviceId = httpUrl(source.id ?? source['@id'])
        .replace(/\/info\.json\/?$/, '')
        .replace(/\/$/, '');
      if (!services.has(serviceId))
        services.set(
          serviceId,
          fetchJson(`${serviceId}/info.json`, signal).then((info) => serviceInfo(info, serviceId))
        );
      const service = await services.get(serviceId)!;
      if (
        (source.width !== undefined && source.width !== service.width) ||
        (source.height !== undefined && source.height !== service.height)
      )
        throw new Error('Annotation dimensions disagree with IIIF metadata.');
      const body = object(annotation.body);
      if (body.resourceCrs) throw new Error('resourceCrs is not supported by the native image-pixel transformer.');
      if (!Array.isArray(body.features)) throw new Error('Missing ground control points.');
      const points = body.features.map((value): WarpControlPoint => {
        const feature = object(value),
          properties = object(feature.properties),
          geometry = object(feature.geometry);
        if (geometry.type !== 'Point') throw new Error('A ground control point must have Point geometry.');
        const [x, y] = point(properties.resourceCoords ?? properties.pixelCoords);
        const [lng, lat] = point(geometry.coordinates);
        projected([lng, lat]);
        if (x < 0 || y < 0 || x > service.width || y > service.height)
          throw new Error('Control point is outside the IIIF image.');
        return { image: { x, y }, map: { lng, lat } };
      });
      const transformer = createWarpTransformer(points, transformation(body));
      const mask = resourceMask(target.selector);
      if (mask.some(([x, y]) => x < 0 || y < 0 || x > service.width || y > service.height))
        throw new Error('Resource mask is outside the IIIF image.');
      const map = { id, service, points, transformer, mask };
      fitMaps([map]); // Report a bad sheet independently instead of hiding all the others.
      maps.push(map);
    } catch (error) {
      if (signal.aborted) throw error;
      warnings.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!maps.length) throw new Error(warnings.join('\n') || 'No maps could be loaded.');
  const outlines: Point[][] = maps
    .filter((map) => map.mask.length)
    .map((map) => {
      const ring: Point[] = [];
      map.mask.forEach((a, i) => {
        const b = map.mask[(i + 1) % map.mask.length];
        for (let step = 0; step < 32; step++)
          ring.push(map.transformer.toGeo(a[0] + ((b[0] - a[0]) * step) / 32, a[1] + ((b[1] - a[1]) * step) / 32));
      });
      ring.push(ring[0]);
      return ring;
    });
  return {
    url,
    maps,
    warnings,
    ...fitMaps(maps),
    markers: {
      type: 'MultiPoint',
      coordinates: maps.flatMap((map) => map.points.map(({ map: p }): Point => [p.lng, p.lat])),
    },
    outlines: { type: 'MultiLineString', coordinates: outlines },
  };
}
