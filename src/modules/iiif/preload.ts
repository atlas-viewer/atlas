import type { ImageService } from '@iiif/presentation-3';
import { TiledImage } from '../../spacial-content/tiled-image';

/** The same tile URLs as TileSet, bounded to a fitted viewport rather than a whole high-resolution pyramid. */
export function getImageServicePreloadUrls(
  service: ImageService,
  viewport: { width: number; height: number }
): string[] {
  const id = service.id || service['@id'];
  if (!id || !service.width || !service.height || viewport.width <= 0 || viewport.height <= 0) return [];
  const urls: string[] = [];
  const ratio = Math.max(service.width / viewport.width, service.height / viewport.height);
  for (const tile of service.tiles || []) {
    const factors = tile.scaleFactors.filter((factor) => factor > 0);
    if (!factors.length) continue;
    const best = factors.reduce((a, b) => (Math.abs(a - ratio) <= Math.abs(b - ratio) ? a : b));
    for (const factor of new Set([Math.max(...factors), best])) {
      const image = TiledImage.fromTile(id, { width: service.width, height: service.height }, tile, factor, service);
      const count = image.columns * image.rows;
      if (count > 16 - urls.length) continue;
      for (let i = 0; i < count; i++) urls.push(image.getImageUrl(i));
    }
  }
  return [...new Set(urls)].slice(0, 16);
}
