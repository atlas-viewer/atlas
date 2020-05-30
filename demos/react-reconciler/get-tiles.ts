import { AnnotationNormalized, AnnotationPageNormalized, CanvasNormalized, Service } from '@hyperion-framework/types';
import { ThumbnailImage, Vault } from '@hyperion-framework/vault';
import { ImageCandidate } from '@atlas-viewer/iiif-image-api/lib/types';

const vault = new Vault();
// @ts-ignore
const loader = vault.imageService;

export type GetTile = {
  id: string;
  width: number;
  height: number;
  thumbnail: { id: string; width: number; height: number };
  imageService: Service;
};

export async function getTiles(manifestId: string): Promise<Array<GetTile>> {
  try {
    const manifest = await vault.loadManifest(manifestId);

    console.log(manifest);

    const tiles: any[] = [];
    for (const canvasRef of manifest.items) {
      const canvas = vault.fromRef<CanvasNormalized>(canvasRef);
      for (const page of canvas.items) {
        for (const anno of vault.fromRef<AnnotationPageNormalized>(page).items) {
          // console.log(vault.fromRef(vault.fromRef<AnnotationNormalized>(anno).body[0]).service[0]);
          const annotation = vault.fromRef<any>(vault.fromRef<AnnotationNormalized>(anno).body[0]);
          const serviceSnippet = annotation.service[0];
          const imageService = await loader.loadService({
            id: serviceSnippet.id,
            width: canvas.width,
            height: canvas.height,
          });

          const { best: thumbnail } = (await vault.getThumbnail(
            canvas,
            {
              maxHeight: 512,
              maxWidth: 512,
            },
            true
          )) as any;

          tiles.push({
            id: imageService.id,
            width: canvas.width,
            height: canvas.height,
            thumbnail,
            imageService,
          });
        }
      }
    }
    return tiles;
  } catch (err) {
    console.log('ERR', err);
    return [];
  }
}
