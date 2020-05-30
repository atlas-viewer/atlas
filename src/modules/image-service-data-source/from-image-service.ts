import { Service } from '@hyperion-framework/types';
import { TiledImage } from '../../spacial-content/tiled-image';
import { CompositeResource } from '../../spacial-content/composite-resource';

export function fromImageService(service: Service, target?: { width?: number; height?: number }): CompositeResource {
  const width = service.width || target!.width;
  const height = service.height || target!.height;
  // let scale = 1;
  // if (target!.width && width) {
  //   scale = (target!.width || 1) / width;
  // }

  if (typeof width === 'undefined' || typeof height === 'undefined') {
    throw new Error('Image service has no width/height and no target, one is required');
  }

  if (service.tiles && service.tiles.length) {
    // level 1 / 2
    return new CompositeResource({
      id: service.id,
      width: width,
      height: height,
      images: service.tiles.reduce((acc: TiledImage[], tile) => {
        return tile.scaleFactors.reduce((innerAcc: TiledImage[], size) => {
          innerAcc.push(
            TiledImage.fromTile(
              service.id,
              {
                width: width,
                height: height,
              },
              tile,
              size
            )
          );
          return acc;
        }, acc);
      }, []),
    });
  }

  if (service.sizes && service.sizes.length) {
    // level 0
  }

  // @todo review this fallback.
  const max = Math.ceil(width / 1024);
  const tileSizes = [];
  for (let i = 0; i < max; i++) {
    tileSizes.push(2 ** i);
  }

  return new CompositeResource({
    id: service.id,
    width: width,
    height: height,
    images: tileSizes.reduce((innerAcc: TiledImage[], size) => {
      innerAcc.push(
        TiledImage.fromTile(
          service.id,
          {
            width: width,
            height: height,
          },
          {
            height: 1024,
            width: 1024,
          },
          size
        )
      );
      return innerAcc;
    }, []),
  });
}
