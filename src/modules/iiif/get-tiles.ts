import { CanvasNormalized, ImageService, ManifestNormalized } from '@iiif/presentation-3';
import { createThumbnailHelper } from '@iiif/vault-helpers';
import { globalVault } from '@iiif/vault';
import { getId, GetTile } from './shared';
import { ImageServiceLoader } from '@atlas-viewer/iiif-image-api';

const vault = globalVault();
const loader = new ImageServiceLoader();
const helper = createThumbnailHelper(vault, { imageServiceLoader: loader });

export async function getTileFromImageService(infoJsonId: string, width: number, height: number): Promise<GetTile> {
  const imageService = await loader.loadService({
    id: infoJsonId,
    width: width,
    height: height,
  });

  return {
    id: getId(imageService),
    width: width,
    height: height,
    imageService: imageService as ImageService,
    thumbnail: undefined,
  };
}

export async function getTileFromCanvas(canvas: CanvasNormalized, thumbnailSize = 512): Promise<GetTile[]> {
  const tiles = [];

  for (const page of canvas.items) {
    for (const anno of vault.get(page).items) {
      const annotation = vault.get(vault.get(anno).body[0]);
      const serviceSnippet = annotation.service[0];

      const tile = await getTileFromImageService(serviceSnippet.id, canvas.width, canvas.height);

      const { best: thumbnail } = (await (helper.getBestThumbnailAtSize as any)(
        vault,
        loader as any,
        canvas,
        {
          maxHeight: thumbnailSize,
          maxWidth: thumbnailSize,
        },
        true
      )) as any;

      if (thumbnail) {
        tile.thumbnail = thumbnail;
      }

      tiles.push(tile);
    }
  }

  return tiles;
}

export async function getTilesFromManifest(manifest: ManifestNormalized) {
  const tiles: any[] = [];
  for (const canvasRef of manifest.items) {
    const canvas = vault.get(canvasRef);
    tiles.push(...(await getTileFromCanvas(canvas)));
  }
  return tiles;
}

export async function getTiles(manifestId: string): Promise<Array<GetTile>> {
  try {
    const manifest = await vault.loadManifest(manifestId);

    if (!manifest) {
      return [];
    }

    return getTilesFromManifest(manifest as any);
  } catch (err) {
    console.log('ERR', err);
    return [];
  }
}
