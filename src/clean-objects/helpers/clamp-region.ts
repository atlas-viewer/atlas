import { SpacialSize, Projection } from '../../types';

export function clampRegion(
  space: SpacialSize,
  {
    x,
    y,
    width,
    height,
    padding = 0,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    padding?: number;
  }
): Projection {
  const w = space.width;
  const h = space.height;
  const matchesHeight = width / w < height / h;

  const rx = x - padding;
  const ry = y - padding;
  const rWidth = width + padding * 2;
  const rHeight = height + padding * 2;

  if (matchesHeight) {
    // pad on the left and right.
    const actualWidth = (rHeight / h) * w;
    return {
      x: rx - (actualWidth - rWidth) / 2,
      y: ry,
      width: actualWidth,
      height: rHeight,
    };
  }
  // pad on the top and bottom.
  const actualHeight = (rWidth / w) * h;
  return {
    x: rx,
    y: ry - (actualHeight - rHeight) / 2,
    width: rWidth,
    height: actualHeight,
  };
}
