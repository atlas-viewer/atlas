import {
  AnnotationNormalized,
  AnnotationPageNormalized,
  CanvasNormalized,
  ManifestNormalized,
  Service,
} from '@hyperion-framework/types';
import { Vault } from '@hyperion-framework/vault';

const vault = new Vault();
const loader = vault.getImageService();

export type GetTile = {
  id: string;
  width: number;
  height: number;
  thumbnail?: { id: string; width: number; height: number };
  imageService: Service;
};

export async function getTileFromImageService(infoJsonId: string, width: number, height: number): Promise<GetTile> {
  const imageService = await loader.loadService({
    id: infoJsonId,
    width: width,
    height: height,
  });

  return {
    id: imageService.id,
    width: width,
    height: height,
    imageService,
    thumbnail: undefined,
  };
}

export async function getTileFromCanvas(canvas: CanvasNormalized, thumbnailSize = 512): Promise<GetTile[]> {
  const tiles = [];

  for (const page of canvas.items) {
    for (const anno of vault.fromRef<AnnotationPageNormalized>(page).items) {
      const annotation = vault.fromRef<any>(vault.fromRef<AnnotationNormalized>(anno).body[0]);
      const serviceSnippet = annotation.service[0];

      const tile = await getTileFromImageService(serviceSnippet.id, canvas.width, canvas.height);

      const { best: thumbnail } = (await vault.getThumbnail(
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
    const canvas = vault.fromRef<CanvasNormalized>(canvasRef);
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

    return getTilesFromManifest(manifest);
  } catch (err) {
    console.log('ERR', err);
    return [];
  }
}
