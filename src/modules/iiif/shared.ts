import { ImageService } from '@iiif/presentation-3';

export type GetTile = {
  id: string;
  width: number;
  height: number;
  thumbnail?: { id: string; width: number; height: number };
  imageService: ImageService;
};

export function getId(entity: any): string {
  return entity.id || entity['@id'];
}
