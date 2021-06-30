import { ImageService } from '@hyperion-framework/types';
import { getId, GetTile } from './shared';
import { imageServiceLoader } from '@atlas-viewer/iiif-image-api';

export async function getTileFromImageService(infoJsonId: string, width: number, height: number): Promise<GetTile> {
  const imageService = await imageServiceLoader.loadService({
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
