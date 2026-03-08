import { SpacialContent } from '../../spacial-content/spacial-content';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';

export function isWebGLImageFastPathCandidate(
  paint: SpacialContent,
  index: number
): paint is SingleImage | TiledImage {
  if (!(paint instanceof SingleImage || paint instanceof TiledImage)) {
    return false;
  }

  if (paint.crop || paint.cropData) {
    return false;
  }

  if (paint.display.rotation) {
    return false;
  }

  if (paint.style && typeof paint.style.opacity !== 'undefined' && paint.style.opacity !== 1) {
    return false;
  }

  if (paint.__owner?.value?.rotation) {
    return false;
  }

  // Reserved for tile-specific checks without changing the API.
  void index;

  return true;
}
