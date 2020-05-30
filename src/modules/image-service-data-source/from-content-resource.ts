// @todo move to Hyperion data source.
import { IIIFExternalWebResource } from '@hyperion-framework/types';
import { SingleImage } from '../../spacial-content/single-image';
import { fromImageService } from './from-image-service';
import { isImageService } from './utility';
import { CompositeResource } from '../../spacial-content/composite-resource';

export function fromContentResource(
  contentResource: IIIFExternalWebResource | string
): Array<CompositeResource | SingleImage> {
  if (typeof contentResource === 'string' || contentResource.type !== 'Image') {
    // @todo could do more?
    return [];
  }

  const services = contentResource!.service || [];
  // Filter image services.
  const imageServices = services.filter(service => isImageService(service));

  const tiles = imageServices
    .map(service => fromImageService(service, contentResource as IIIFExternalWebResource))
    .filter(r => r !== null) as CompositeResource[];

  if (tiles.length) {
    return tiles;
  }

  if (contentResource.id && contentResource!.width && contentResource!.height) {
    return [
      SingleImage.fromImage(contentResource.id, {
        width: contentResource.width as number,
        height: contentResource.height as number,
      }),
    ];
  }
  return [];
}
