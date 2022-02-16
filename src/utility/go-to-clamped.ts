import { Projection } from '../types';

function goTo(
  target: Projection,
  fromObj: Projection,
  { scaleFactor = 1, cover = false }: { scaleFactor?: number; cover?: boolean } = {}
) {
  const width = fromObj.width * scaleFactor;
  const height = fromObj.height * scaleFactor;

  const widthScale = target.width / width;
  const heightScale = target.height / height;
  const ar = width / height;

  if (cover ? widthScale > heightScale : widthScale < heightScale) {
    const fullWidth = ar * target.height;
    const space = (fullWidth - target.width) / 2;

    return {
      x: -space,
      y: 0,
      width: fullWidth,
      height: target.height,
    };
  } else {
    const fullHeight = target.width / ar;
    const space = (fullHeight - target.height) / 2;

    return {
      x: 0,
      y: -space,
      width: target.width,
      height: fullHeight,
    };
  }
}
