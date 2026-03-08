import type { MapTileSource, MapTileUrlContext } from './types';

export const DEFAULT_OSM_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

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

export function resolveTileTemplate(template: string, ctx: MapTileUrlContext): string {
  const subdomain = getSubdomainForTile(ctx) || '';

  return template
    .replace(/\{z\}/g, `${ctx.z}`)
    .replace(/\{x\}/g, `${ctx.x}`)
    .replace(/\{y\}/g, `${ctx.y}`)
    .replace(/\{s\}/g, subdomain);
}

export function resolveTileUrl(source: MapTileSource | undefined, ctx: MapTileUrlContext): string {
  const resolvedSource = source || DEFAULT_OSM_TILE_TEMPLATE;
  if (typeof resolvedSource === 'function') {
    return resolvedSource(ctx);
  }
  return resolveTileTemplate(resolvedSource, ctx);
}
