import type { MapTileSource, MapTileUrlContext } from './types';

export const DEFAULT_OSM_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/**
 * The OpenStreetMap tile servers (and most other tile providers) require visible attribution.
 * See https://operations.osmfoundation.org/policies/tiles/
 */
export const OSM_ATTRIBUTION = {
  text: '© OpenStreetMap contributors',
  href: 'https://www.openstreetmap.org/copyright',
} as const;

export function getSubdomainForTile(ctx: MapTileUrlContext): string | undefined {
  if (ctx.s) {
    return ctx.s;
  }

  const subdomains = ctx.subdomains || [];
  if (subdomains.length === 0) {
    return undefined;
  }

  const index = Math.abs(ctx.x + ctx.y + ctx.z) % subdomains.length;
  return subdomains[index];
}

/**
 * Quadkey (Bing-style) identifier for a tile.
 */
export function tileToQuadkey(x: number, y: number, z: number): string {
  let key = '';
  for (let i = z; i > 0; i--) {
    const mask = 1 << (i - 1);
    let digit = 0;
    if ((x & mask) !== 0) {
      digit += 1;
    }
    if ((y & mask) !== 0) {
      digit += 2;
    }
    key += digit;
  }
  return key;
}

/**
 * Supported tokens: `{z}` `{x}` `{y}` `{-y}` (TMS row) `{s}` (subdomain) `{r}` (retina suffix) `{q}` (quadkey).
 */
export function resolveTileTemplate(template: string, ctx: MapTileUrlContext): string {
  const subdomain = getSubdomainForTile(ctx) || '';

  return template
    .replace(/\{z\}/g, `${ctx.z}`)
    .replace(/\{x\}/g, `${ctx.x}`)
    .replace(/\{-y\}/g, `${Math.pow(2, ctx.z) - 1 - ctx.y}`)
    .replace(/\{y\}/g, `${ctx.y}`)
    .replace(/\{q\}/g, () => tileToQuadkey(ctx.x, ctx.y, ctx.z))
    .replace(/\{r\}/g, ctx.retina ? '@2x' : '')
    .replace(/\{s\}/g, subdomain);
}

export function resolveTileUrl(source: MapTileSource | undefined, ctx: MapTileUrlContext): string {
  const resolvedSource = source || DEFAULT_OSM_TILE_TEMPLATE;
  if (typeof resolvedSource === 'function') {
    return resolvedSource(ctx);
  }
  return resolveTileTemplate(resolvedSource, ctx);
}
